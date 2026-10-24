'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

class WindowsBannerControl {
  /**
   * @param {Object} options
   * @param {string} options.stateFile Absolute path to state journal
   * @param {string} options.scriptPath Path to windows_banner_control.ps1
   * @param {Function} options.openSettings Injected openSettings function: async () => void
   * @param {Function} options.canReplace Injected check whether mirroring/listener allows banner replacement: async () => boolean
   * @param {Function} [options.runScript] Injected runner for powershell script: async (action: 'read'|'on'|'off') => Object
   * @param {string} [options.platform] Platform override (defaults to process.platform)
   * @param {Function} [options.now] Function returning ISO timestamp or ms
   */
  constructor(options = {}) {
    if (!options.stateFile || typeof options.stateFile !== 'string' || !path.isAbsolute(options.stateFile)) {
      throw new Error('WindowsBannerControl: stateFile must be an absolute path.');
    }
    if (!options.scriptPath || typeof options.scriptPath !== 'string') {
      throw new Error('WindowsBannerControl: scriptPath is required.');
    }
    if (typeof options.openSettings !== 'function') {
      throw new Error('WindowsBannerControl: openSettings must be a function.');
    }
    if (typeof options.canReplace !== 'function') {
      throw new Error('WindowsBannerControl: canReplace must be a function.');
    }

    this.stateFile = options.stateFile;
    this.scriptPath = options.scriptPath;
    this.openSettings = options.openSettings;
    this.canReplace = options.canReplace;
    this.platform = options.platform || process.platform;
    this.now = typeof options.now === 'function' ? options.now : () => new Date().toISOString();

    if (typeof options.runScript === 'function') {
      this.runScript = options.runScript;
    } else {
      this.runScript = this._defaultRunScript.bind(this);
    }

    this._busy = false;
  }

  _getNow() {
    const val = this.now();
    return typeof val === 'string' ? val : new Date(val).toISOString();
  }

  _defaultRunScript(action) {
    return new Promise((resolve, reject) => {
      const args = [
        '-NoProfile',
        '-NonInteractive',
        '-STA',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        this.scriptPath,
        '-Action',
        action
      ];

      execFile(
        path.join(process.env.WINDIR||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),
        args,
        {
          windowsHide: true,
          timeout: 20000,
          encoding: 'utf8'
        },
        (error, stdout, stderr) => {
          if (error) {
            return resolve({
              success: false,
              code: 'unsupported',
              error: 'PowerShell helper execution failed or timed out.'
            });
          }
          try {
            const trimmed = (stdout || '').trim();
            if (!trimmed) {
              return resolve({
                success: false,
                code: 'control-unavailable',
                error: 'No response from PowerShell helper.'
              });
            }
            const parsed = JSON.parse(trimmed);
            return resolve(parsed);
          } catch (parseErr) {
            return resolve({
              success: false,
              code: 'unsupported',
              error: 'Failed to parse PowerShell helper output.'
            });
          }
        }
      );
    });
  }

  /**
   * Synchronous inspection of the persisted journal only.
   * Does NOT touch OS UI or query live automation.
   */
  status() {
    const journalResult = this._readJournal();
    if (journalResult.corrupt) {
      return {
        success: false,
        code: 'malformed-journal',
        error: 'State journal is corrupted or malformed.',
        active: false,
        owned: false,
        lastVerifiedAt: null
      };
    }

    const journal = journalResult.journal;
    if (!journal) {
      return {
        success: true,
        active: false,
        owned: false,
        lastVerifiedAt: null
      };
    }

    return {
      success: true,
      active: !!journal.active,
      owned: !!journal.owned,
      originalState: journal.originalState || null,
      lastVerifiedAt: journal.lastVerifiedAt || null
    };
  }

  /**
   * Reads the journal file safely.
   * @returns {{ journal: Object|null, corrupt: boolean }}
   */
  _readJournal() {
    if (!fs.existsSync(this.stateFile)) {
      return { journal: null, corrupt: false };
    }

    try {
      const raw = fs.readFileSync(this.stateFile, 'utf8');
      if (!raw || !raw.trim() || raw.length>16384) return {journal:null,corrupt:true};
      const data = JSON.parse(raw);
      if (typeof data !== 'object' || data === null || data.version !== 1 || !['On','Off'].includes(data.originalState) || typeof data.owned!=='boolean' || typeof data.active!=='boolean' || (data.pending!==undefined&&typeof data.pending!=='boolean')) {
        return { journal: null, corrupt: true };
      }
      return { journal: data, corrupt: false };
    } catch (e) {
      return { journal: null, corrupt: true };
    }
  }

  /**
   * Atomically writes the journal file.
   */
  _writeJournal(journal) {
    const tempFile = `${this.stateFile}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
    const dir = path.dirname(this.stateFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    try {fs.writeFileSync(tempFile, JSON.stringify(journal, null, 2), {encoding:'utf8',flag:'wx'});fs.renameSync(tempFile, this.stateFile);}
    finally {try{fs.unlinkSync(tempFile);}catch{}}
  }

  /**
   * Removes the journal file safely.
   */
  _clearJournal() {
    if (fs.existsSync(this.stateFile)) {
      fs.unlinkSync(this.stateFile);
    }
  }

  /**
   * Requests enabling Do Not Disturb mode.
   */
  async enable() {
    if (this.platform !== 'win32') {
      return {
        success: false,
        code: 'unsupported',
        error: 'Windows banner suppression is only supported on Windows.'
      };
    }

    if (this._busy) {
      return {
        success: false,
        code: 'busy',
        error: 'Another banner control operation is currently in progress.'
      };
    }

    this._busy = true;
    try {
      // 1. Check permission gate before opening UI
      let allowed = false;
      try {
        allowed = await this.canReplace();
      } catch (gateErr) {
        return {
          success: false,
          code: 'gate-denied',
          error: 'Error evaluating notification replacement gate.'
        };
      }

      if (allowed!==true) {
        return {
          success: false,
          code: 'gate-denied',
          error: 'Notification replacement gate is not active or authorized.'
        };
      }

      // Check preexisting journal integrity before touching UI
      const readRes = this._readJournal();
      if (readRes.corrupt) {
        return {
          success: false,
          code: 'malformed-journal',
          error: 'Existing state journal is corrupted. Refusing operation to preserve state.'
        };
      }

      // 2. Open ms-settings:notifications
      try {
        await this.openSettings();
      } catch (openErr) {
        return {
          success: false,
          code: 'control-unavailable',
          error: 'Failed to open Windows Notifications Settings.'
        };
      }

      // 3. Read current Windows DND state
      const initial = await this.runScript('read');
      if (!initial || !initial.success || !['On','Off'].includes(initial.state)) {
        return {
          success: false,
          code: initial && initial.code ? initial.code : 'control-unavailable',
          error: initial && initial.error ? initial.error : 'Failed to read initial Windows Do Not Disturb state.'
        };
      }

      const currentState = initial.state; // 'On' | 'Off'
      const existingJournal = readRes.journal;

      if (currentState === 'On') {
        // If already On, check if we previously owned it
        if (existingJournal && existingJournal.active) {
          // Keep existing journal (preserve originalOff if it was Off originally)
          return {
            success: true,
            owned: !!existingJournal.owned,
            lastVerifiedAt: existingJournal.lastVerifiedAt || this._getNow(),
            message: 'Do Not Disturb is already enabled.'
          };
        } else {
          // It was already On externally before we enabled it; record originalState: 'On', owned: false
          const record = {
            version: 1,
            originalState: 'On',
            owned: false,
            active: true,
            lastVerifiedAt: this._getNow()
          };
          try {
            this._writeJournal(record);
          } catch (writeErr) {
            return {
              success: false,
              code: 'storage-failure',
              error: 'Failed to save banner control state journal.'
            };
          }
          return {
            success: true,
            owned: false,
            lastVerifiedAt: record.lastVerifiedAt,
            message: 'Do Not Disturb was already enabled by system or user.'
          };
        }
      }

      // currentState === 'Off'
      // Determine what originalState to preserve
      // If we already had an active journal, preserve its originalState (do not overwrite originalOff)
      const originalState = 'Off';

      const pendingJournal = {
        version: 1,
        originalState: originalState,
        owned: true,
        active: false,
        pending: true,
        lastVerifiedAt: null
      };

      // Atomically persist state BEFORE toggling
      try {
        this._writeJournal(pendingJournal);
      } catch (writeErr) {
        // Save failure before toggle must not mutate OS
        return {
          success: false,
          code: 'storage-failure',
          error: 'Failed to save banner control state journal before toggling.'
        };
      }

      // Toggle to On
      const toggleRes = await this.runScript('on');
      if (!toggleRes || !toggleRes.success || toggleRes.state !== 'On') {
        // Toggle failure retains journal for recovery and returns failure
        return {
          success: false,
          code: toggleRes && toggleRes.code ? toggleRes.code : 'unverified',
          error: toggleRes && toggleRes.error ? toggleRes.error : 'Failed to verify Do Not Disturb toggled On.'
        };
      }

      // Update lastVerifiedAt
      pendingJournal.active=true;
      pendingJournal.pending=false;
      if(toggleRes.before==='On'&&toggleRes.changed===false){pendingJournal.originalState='On';pendingJournal.owned=false;}
      pendingJournal.lastVerifiedAt = this._getNow();
      try {
        this._writeJournal(pendingJournal);
      } catch (e) {
        // Non-fatal if state is already verified and written once
      }

      return {
        success: true,
        owned: pendingJournal.owned,
        lastVerifiedAt: pendingJournal.lastVerifiedAt
      };
    } finally {
      this._busy = false;
    }
  }

  /**
   * Restores Do Not Disturb mode to previous state.
   * canReplace is NOT gated for restore so user can always undo.
   */
  async restore() {
    if (this.platform !== 'win32') {
      return {
        success: false,
        code: 'unsupported',
        error: 'Windows banner suppression is only supported on Windows.'
      };
    }

    if (this._busy) {
      return {
        success: false,
        code: 'busy',
        error: 'Another banner control operation is currently in progress.'
      };
    }

    this._busy = true;
    try {
      const readRes = this._readJournal();
      if (readRes.corrupt) {
        return {
          success: false,
          code: 'malformed-journal',
          error: 'Existing state journal is corrupted. Refusing operation to preserve state.'
        };
      }

      const journal = readRes.journal;
      if (!journal || (!journal.active&&!journal.pending)) {
        // Nothing owned or previously active
        return {
          success: true,
          owned: false,
          restored: false,
          message: 'No active banner suppression session to restore.'
        };
      }

      // If originalState was On, MOHIVX did not turn it on initially; do not toggle it off
      if (!journal.owned || journal.originalState === 'On') {
        this._clearJournal();
        return {
          success: true,
          owned: false,
          restored: false,
          message: 'Original Do Not Disturb state was On; preserved as-is.'
        };
      }

      // Original state was Off and owned = true
      // 1. Open ms-settings:notifications
      try {
        await this.openSettings();
      } catch (openErr) {
        return {
          success: false,
          code: 'control-unavailable',
          error: 'Failed to open Windows Notifications Settings.'
        };
      }

      // 2. Read current Windows DND state
      const initial = await this.runScript('read');
      if (!initial || !initial.success || !['On','Off'].includes(initial.state)) {
        return {
          success: false,
          code: initial && initial.code ? initial.code : 'control-unavailable',
          error: initial && initial.error ? initial.error : 'Failed to read current Windows Do Not Disturb state.'
        };
      }

      if (initial.state === 'Off') {
        // User already manually turned it Off! Never toggle it back on.
        this._clearJournal();
        return {
          success: true,
          owned: false,
          restored: false,
          message: 'Do Not Disturb was already turned Off manually.'
        };
      }

      // 3. State is On and original was Off: toggle Off and verify
      const toggleRes = await this.runScript('off');
      if (!toggleRes || !toggleRes.success || toggleRes.state !== 'Off') {
        return {
          success: false,
          code: toggleRes && toggleRes.code ? toggleRes.code : 'unverified',
          error: toggleRes && toggleRes.error ? toggleRes.error : 'Failed to verify Do Not Disturb toggled Off.'
        };
      }

      this._clearJournal();

      return {
        success: true,
        owned: false,
        restored: true,
        lastVerifiedAt: this._getNow()
      };
    } finally {
      this._busy = false;
    }
  }
}

module.exports = { WindowsBannerControl };
