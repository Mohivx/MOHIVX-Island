!include nsDialogs.nsh
!include LogicLib.nsh
!ifndef BUILD_UNINSTALLER
Var mohivxRemoveRadio
Var mohivxUpdateRadio
Var mohivxUninstallCommand
Var mohivxInstalledVersion
Var mohivxAgentQuestions
Var mohivxAgentCheckbox
Var mohivxPreviousNodeMode
LangString MohivxAgentTitle 1033 "AI questions in your island"
LangString MohivxAgentTitle 1025 "أسئلة الوكلاء في الجزيرة"
LangString MohivxAgentOption 1033 "Automatically connect supported AI agents to MOHIVX Island"
LangString MohivxAgentOption 1025 "ربط الوكلاء المدعومين بالجزيرة تلقائيًا"
LangString MohivxAgentDetails 1033 "Save a permanent preference in detected Codex, Antigravity, Gemini CLI and Claude Code settings. In new or reloaded local chats, the agent sends questions through a terminal command and waits for your answer in the island. Existing settings are backed up. You can remove each connection from Agents in MOHIVX. Host security permissions still apply."
LangString MohivxAgentDetails 1025 "يحفظ تفضيلًا دائمًا في إعدادات Codex وAntigravity وGemini CLI وClaude Code الموجودة. في الشاتات الجديدة أو المعاد تحميلها، يرسل الوكيل السؤال عبر الطرفية وينتظر جوابك في الجزيرة. تُحفظ نسخة احتياطية من الإعدادات، ويمكن إزالة الربط من قسم الوكلاء. تبقى أذونات الأمان الخاصة بالوكيل سارية."
LangString MohivxAgentFailed 1033 "MOHIVX is installed, but some agent connections need review. Open Agents in MOHIVX to complete them."
LangString MohivxAgentFailed 1025 "تم تثبيت MOHIVX، لكن بعض روابط الوكلاء تحتاج مراجعة. افتح قسم الوكلاء في التطبيق لإكمالها."
LangString MohivxMicOption 1033 "MOHIV Mic is configured automatically for the phone microphone during installation."
LangString MohivxMicOption 1025 "يتم تجهيز MOHIV Mic تلقائيًا لمايك الهاتف أثناء التثبيت."
LangString MohivxMicCredit 1033 "Uses VB-CABLE by VB-Audio (donationware). Source / donations: vb-audio.com/Cable/. Windows may request administrator permission or a restart."
LangString MohivxMicCredit 1025 "يستخدم VB-CABLE من VB-Audio، المتاح بالتبرعات. المصدر والتبرع: vb-audio.com/Cable/. قد يطلب ويندوز صلاحية مسؤول أو إعادة التشغيل."
LangString MohivxMicFailed 1033 "MOHIVX is installed. MOHIV Mic setup was not completed. You can retry from Phone in MOHIVX."
LangString MohivxMicFailed 1025 "تم تثبيت MOHIVX، ولم يكتمل تجهيز MOHIV Mic. يمكنك إعادة المحاولة من قسم الهاتف في التطبيق."
LangString MohivxRestartDetails 1033 "MOHIVX Island is installed. Windows needs a restart to finish setting up MOHIV Mic. Restart now or later? Save your work before restarting."
LangString MohivxRestartDetails 1025 "تم تثبيت MOHIVX Island. يحتاج ويندوز إلى إعادة التشغيل لإكمال تجهيز MOHIV Mic. اختر الآن أو لاحقًا، واحفظ عملك قبل إعادة التشغيل."
LangString MohivxRestartNow 1033 "Restart now"
LangString MohivxRestartNow 1025 "إعادة التشغيل الآن"
LangString MohivxRestartLater 1033 "Restart later (keep working)"
LangString MohivxRestartLater 1025 "لاحقًا (متابعة العمل)"
LangString MohivxRestartConfirm 1033 "Restart the computer now? Save your open work first. Choose No to restart later."
LangString MohivxRestartConfirm 1025 "هل تريد إعادة تشغيل الكمبيوتر الآن؟ احفظ أعمالك المفتوحة أولًا. اختر لا لتأجيل إعادة التشغيل."
LangString MohivxWelcome 1033 "Install MOHIVX Island"
LangString MohivxWelcome 1025 "تثبيت MOHIVX Island"
LangString MohivxFresh 1033 "MOHIVX Island is not installed. Continue to choose a location and install it."
LangString MohivxFresh 1025 "MOHIVX Island غير مثبت. تابع لاختيار مكان التثبيت وتثبيت التطبيق."
LangString MohivxMaintain 1033 "MOHIVX Island is already installed. Choose an action. Updating keeps your settings and paired devices."
LangString MohivxMaintain 1025 "يوجد إصدار مثبت من MOHIVX Island. اختر الإجراء. يحافظ التحديث على إعداداتك والأجهزة المرتبطة."
LangString MohivxUpdate 1033 "Update / reinstall"
LangString MohivxUpdate 1025 "تحديث / إعادة التثبيت"
LangString MohivxRemove 1033 "Uninstall MOHIVX Island"
LangString MohivxRemove 1025 "حذف MOHIVX Island"
!macro customWelcomePage
 Page custom MohivxMaintenanceCreate MohivxMaintenanceLeave
 Page custom MohivxAgentRoutingCreate MohivxAgentRoutingLeave
Function MohivxMaintenanceCreate
 ReadRegStr $mohivxUninstallCommand HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
 ReadRegStr $mohivxInstalledVersion HKCU "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
 ${If} $mohivxUninstallCommand == ""
  ReadRegStr $mohivxUninstallCommand HKLM "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  ReadRegStr $mohivxInstalledVersion HKLM "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
 ${EndIf}
 !insertmacro MUI_HEADER_TEXT "$(MohivxWelcome)" "MOHIVX Island ${VERSION}"
 ${If} $LANGUAGE == 1025
  nsDialogs::SetRTL 1
 ${Else}
  nsDialogs::SetRTL 0
 ${EndIf}
 nsDialogs::Create 1018
 Pop $0
 ${If} $0 == error
  Abort
 ${EndIf}
 ${If} $mohivxUninstallCommand == ""
  ${NSD_CreateLabel} 0 8u 100% 52u "$(MohivxFresh)"
  Pop $0
  StrCpy $mohivxRemoveRadio ""
 ${Else}
  ${NSD_CreateLabel} 0 8u 100% 52u "$(MohivxMaintain)$\r$\n$mohivxInstalledVersion → ${VERSION}"
  Pop $0
  ${NSD_CreateRadioButton} 0 70u 100% 20u "$(MohivxUpdate)"
  Pop $mohivxUpdateRadio
  ${NSD_Check} $mohivxUpdateRadio
  ${NSD_CreateRadioButton} 0 100u 100% 20u "$(MohivxRemove)"
  Pop $mohivxRemoveRadio
 ${EndIf}
 ${NSD_CreateLabel} 0 128u 100% 22u "$(MohivxMicOption)"
 Pop $0
 ${NSD_CreateLabel} 0 152u 100% 44u "$(MohivxMicCredit)"
 Pop $0
 nsDialogs::Show
FunctionEnd
Function MohivxMaintenanceLeave
 ${If} $mohivxRemoveRadio != ""
  ${NSD_GetState} $mohivxRemoveRadio $0
  ${If} $0 == ${BST_CHECKED}
   HideWindow
   ExecWait '$mohivxUninstallCommand' $0
   Quit
  ${EndIf}
 ${EndIf}
FunctionEnd
Function MohivxAgentRoutingCreate
 !insertmacro MUI_HEADER_TEXT "$(MohivxAgentTitle)" "MOHIVX Island"
 ${If} $LANGUAGE == 1025
  nsDialogs::SetRTL 1
 ${Else}
  nsDialogs::SetRTL 0
 ${EndIf}
 nsDialogs::Create 1018
 Pop $0
 ${If} $0 == error
  Abort
 ${EndIf}
 ${NSD_CreateCheckbox} 0 10u 100% 30u "$(MohivxAgentOption)"
 Pop $mohivxAgentCheckbox
 ${If} $mohivxAgentQuestions == "1"
  ${NSD_Check} $mohivxAgentCheckbox
 ${EndIf}
 ${NSD_CreateLabel} 0 52u 100% 120u "$(MohivxAgentDetails)"
 Pop $0
 nsDialogs::Show
FunctionEnd
Function MohivxAgentRoutingLeave
 ${NSD_GetState} $mohivxAgentCheckbox $0
 StrCpy $mohivxAgentQuestions "0"
 ${If} $0 == ${BST_CHECKED}
  StrCpy $mohivxAgentQuestions "1"
 ${EndIf}
FunctionEnd
!macroend
!macro customInit
 StrCpy $mohivxAgentQuestions "1"
!macroend
!macro customFinishPage
 !define MUI_FINISHPAGE_REBOOTLATER_DEFAULT
 !define MUI_FINISHPAGE_TEXT_LARGE
 !define MUI_FINISHPAGE_TEXT_REBOOT "$(MohivxRestartDetails)"
 !define MUI_FINISHPAGE_TEXT_REBOOTNOW "$(MohivxRestartNow)"
 !define MUI_FINISHPAGE_TEXT_REBOOTLATER "$(MohivxRestartLater)"
 !define MUI_PAGE_CUSTOMFUNCTION_SHOW MohivxFinishShow
 !define MUI_PAGE_CUSTOMFUNCTION_LEAVE MohivxFinishLeave
 !ifndef HIDE_RUN_AFTER_FINISH
  Function MohivxStartApp
   ${If} ${isUpdated}
    StrCpy $1 "--updated"
   ${Else}
    StrCpy $1 ""
   ${EndIf}
   ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION "MohivxStartApp"
 !endif
 !insertmacro MUI_PAGE_FINISH
Function MohivxFinishShow
 ${If} ${RebootFlag}
  ; MUI otherwise focuses Restart now even when Restart later is selected.
  ${NSD_SetFocus} $mui.FinishPage.RebootLater
 ${EndIf}
FunctionEnd
Function MohivxFinishLeave
 IfSilent mohivx_restart_later
 ${If} ${RebootFlag}
  ${NSD_GetState} $mui.FinishPage.RebootNow $0
  ${If} $0 == ${BST_CHECKED}
   ; The standard MUI reboot runs only after this callback returns.
   MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "$(MohivxRestartConfirm)" IDYES mohivx_restart_confirmed
   Goto mohivx_restart_later
  ${EndIf}
 ${EndIf}
 Return
 mohivx_restart_later:
 ${If} ${RebootFlag}
  ${NSD_Uncheck} $mui.FinishPage.RebootNow
  ${NSD_Check} $mui.FinishPage.RebootLater
 ${EndIf}
 mohivx_restart_confirmed:
FunctionEnd
!macroend
!macro customInstall
 FileOpen $0 "$INSTDIR\installer-language.txt" w
 ${If} $LANGUAGE == 1025
  FileWrite $0 "ar"
 ${Else}
  FileWrite $0 "en"
 ${EndIf}
 FileClose $0
 ${If} $mohivxAgentQuestions == "1"
  ReadEnvStr $mohivxPreviousNodeMode "ELECTRON_RUN_AS_NODE"
  System::Call 'Kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", t "1")'
  ClearErrors
  ExecWait '"$INSTDIR\MOHIVX Island.exe" "$INSTDIR\resources\app.asar\scripts\setup-agent-routing.cjs" --install --home "$PROFILE" --runtime "$INSTDIR\MOHIVX Island.exe"' $0
  ${If} ${Errors}
   StrCpy $0 1
  ${EndIf}
  System::Call 'Kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", t "$mohivxPreviousNodeMode")'
  ${If} $0 != 0
   IfSilent +2
   MessageBox MB_OK|MB_ICONEXCLAMATION "$(MohivxAgentFailed)"
  ${EndIf}
 ${EndIf}
 ClearErrors
 ExecWait '"$INSTDIR\resources\mohiv-mic\MOHIVMicSetup.exe" --install' $0
 ${If} ${Errors}
  StrCpy $0 1
 ${EndIf}
 FileOpen $1 "$INSTDIR\installer-mic-status.txt" w
 ${If} $0 == 0
  FileWrite $1 "ready:0"
 ${ElseIf} $0 == 3010
  FileWrite $1 "restart:3010"
 ${ElseIf} $0 == 1223
  FileWrite $1 "cancelled:1223"
 ${Else}
  FileWrite $1 "failed:$0"
 ${EndIf}
 FileClose $1
 ${If} $0 == 3010
  SetRebootFlag true
 ${ElseIf} $0 != 0
  IfSilent +2
  MessageBox MB_OK|MB_ICONEXCLAMATION "$(MohivxMicFailed)"
 ${EndIf}
!macroend
!endif
