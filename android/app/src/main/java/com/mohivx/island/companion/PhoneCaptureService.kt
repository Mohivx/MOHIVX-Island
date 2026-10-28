package com.mohivx.island.companion

import android.app.*
import android.content.*
import android.content.pm.ServiceInfo
import android.graphics.*
import android.hardware.camera2.*
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.*
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.*
import android.util.Base64
import android.view.Surface
import android.view.WindowManager
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/** Capture starts only from a visible activity after Android consent. No automatic restart. */
class PhoneCaptureService:Service() {
    companion object {
        const val START="com.mohivx.START_CAPTURE"
        const val STOP="com.mohivx.STOP_CAPTURE"
        const val CHANGED="com.mohivx.CAPTURE_CHANGED"
        @Volatile var active:Set<String> = emptySet()
            private set
        @Volatile var lastError=""
            private set
    }
    private val main=Handler(Looper.getMainLooper())
    private val sessions=mutableMapOf<String,Capture>()
    private lateinit var client:CompanionClient
    private var destroying=false
    private val ar get()=getSharedPreferences("ui",MODE_PRIVATE).getBoolean("ar",resources.configuration.locales[0].language=="ar")
    private fun t(en:String,a:String)=if(ar)a else en
    override fun onBind(intent:Intent?)=null
    override fun onCreate(){super.onCreate();client=CompanionClient(this);if(Build.VERSION.SDK_INT>=26)(getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(NotificationChannel("phone-sharing","MOHIVX Island · Phone sharing",NotificationManager.IMPORTANCE_LOW))}
    override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {
        if(intent?.action==STOP){val kind=intent.getStringExtra("kind");if(kind==null)sessions.keys.toList().forEach{stop(it)} else stop(kind);if(sessions.isEmpty())stopSelf();return START_NOT_STICKY}
        val kind=intent?.getStringExtra("kind") ?: run{stopSelf();return START_NOT_STICKY}
        if(intent.action!=START||kind !in setOf("camera","screen","mic","audio")||!client.paired){stopSelf();return START_NOT_STICKY}
        if(sessions.containsKey(kind))return START_NOT_STICKY
        lastError=""
        val session=Capture(kind,intent.getBooleanExtra("front",false));sessions[kind]=session
        try{foreground();changed();session.begin(intent)}catch(e:Exception){lastError=e.message ?: "Capture unavailable";stop(kind)}
        return START_NOT_STICKY
    }
    private fun changed(){active=sessions.keys.toSet();sendBroadcast(Intent(CHANGED).setPackage(packageName))}
    private fun foreground(){
        val stop=PendingIntent.getService(this,41,Intent(this,PhoneCaptureService::class.java).setAction(STOP),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val open=PendingIntent.getActivity(this,42,Intent(this,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val builder=if(Build.VERSION.SDK_INT>=26)Notification.Builder(this,"phone-sharing") else Notification.Builder(this)
        val labels=sessions.keys.map{when(it){"camera"->t("Camera","الكاميرا");"mic"->t("Microphone","المايك");"audio"->t("Phone audio","صوت الهاتف");else->t("Screen","الشاشة")}}
        val notification=builder.setSmallIcon(android.R.drawable.ic_menu_camera).setContentTitle(t("Sharing with MOHIVX Island","مشاركة مع MOHIVX Island")).setContentText(labels.joinToString(" · ")).setOngoing(true).setContentIntent(open).addAction(android.R.drawable.ic_media_pause,t("Stop all","إيقاف الكل"),stop).build()
        var types=0
        if(sessions.containsKey("screen")||sessions.containsKey("audio"))types=types or ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
        if(Build.VERSION.SDK_INT>=30){if(sessions.containsKey("camera"))types=types or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA;if(sessions.containsKey("mic"))types=types or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE}
        if(Build.VERSION.SDK_INT>=29)startForeground(44,notification,types) else startForeground(44,notification)
    }
    private fun stop(kind:String){
        sessions.remove(kind)?.close();changed();if(kind=="screen")PhoneControlService.hidePointer()
        if(sessions.isEmpty()){stopForeground(true);if(!destroying)stopSelf()}else if(!destroying)foreground()
    }
    private fun fail(kind:String,error:Exception){main.post{if(sessions.containsKey(kind)){lastError=error.message ?: "Sharing stopped";stop(kind)}}}
    override fun onDestroy(){destroying=true;sessions.keys.toList().forEach{stop(it)};super.onDestroy()}

    private inner class Capture(val kind:String,val front:Boolean) {
        private val client=CompanionClient(this@PhoneCaptureService)
        private val transport=Executors.newSingleThreadExecutor()
        private var transportFailures=0
        @Volatile private var stopped=false
        private var streamId=""
        private val audioSending=AtomicBoolean(false)
        private val audioQueue=java.util.ArrayDeque<ByteArray>()
        private val sending=AtomicBoolean(false)
        private var lastFrame=0L
        private var thread:HandlerThread?=null
        private var handler:Handler?=null
        private var reader:ImageReader?=null
        private var projection:MediaProjection?=null
        private var display:VirtualDisplay?=null
        private var camera:CameraDevice?=null
        private var cameraSession:CameraCaptureSession?=null
        private var recorder:AudioRecord?=null
        private var sensorRotation=0

        fun begin(intent:Intent){
            transport.execute{try{
                if(stopped)return@execute
                val started=client.request("/api/phone-start",JSONObject().put("kind",kind));streamId=started.getString("streamId");client.enableMediaLanes(started.optBoolean("mediaLanes"))
                main.post{if(!stopped)try{when(kind){"mic"->microphone();"screen"->screen(intent);"camera"->camera();"audio"->playbackAudio(intent)}}catch(e:Exception){fail(kind,e)}}
            }catch(e:Exception){fail(kind,e)}}
        }
        private fun background():Handler {thread=HandlerThread("MOHIVX-$kind").apply{start()};return Handler(thread!!.looper).also{handler=it}}
        private fun send(bytes:ByteArray,rate:Int?=null,channels:Int?=null){
            if(stopped||streamId.isEmpty()||!sending.compareAndSet(false,true))return
            transport.execute{try{if(!stopped){val body=JSONObject().put("streamId",streamId).put("data",Base64.encodeToString(bytes,Base64.NO_WRAP));if(rate!=null)body.put("rate",rate);if(channels!=null)body.put("channels",channels);client.request("/api/phone-$kind",body);transportFailures=0}}catch(e:Exception){
                if(e is java.net.SocketTimeoutException || e is java.net.ConnectException || e is java.net.SocketException){transportFailures++;if(transportFailures>=3)fail(kind,e)}else fail(kind,e)
            }finally{sending.set(false)}}
        }
        private fun jpeg(bitmap:Bitmap){
            try{val out=ByteArrayOutputStream();bitmap.compress(Bitmap.CompressFormat.JPEG,65,out);if(out.size()<750000)send(out.toByteArray())}finally{bitmap.recycle()}
        }
        private fun due():Boolean {val now=SystemClock.elapsedRealtime();if(stopped||sending.get()||now-lastFrame<(if(kind=="camera")66 else 100))return false;lastFrame=now;return true}
        @Suppress("MissingPermission") private fun microphone(){
            val rate=16000;val minimum=AudioRecord.getMinBufferSize(rate,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT)
            require(minimum>0){"Microphone format unavailable"}
            val audio=AudioRecord(MediaRecorder.AudioSource.MIC,rate,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT,maxOf(minimum*2,12800));recorder=audio
            require(audio.state==AudioRecord.STATE_INITIALIZED){"Microphone unavailable"};audio.startRecording()
            require(audio.recordingState==AudioRecord.RECORDSTATE_RECORDING){"Microphone access denied"}
            Thread({try{val block=ByteArray(6400);while(!stopped){var used=0;while(used<block.size&&!stopped){val count=audio.read(block,used,block.size-used);if(count<=0)throw IllegalStateException("Microphone stopped");used+=count};if(used>0&&!stopped)send(block.copyOf(used-used%2),rate)}}catch(e:Exception){if(!stopped)fail(kind,e)}},"MOHIVX-audio").start()
        }
        @android.annotation.TargetApi(29)
        @Suppress("MissingPermission") private fun playbackAudio(intent:Intent){
            require(Build.VERSION.SDK_INT>=29){"Phone playback audio needs Android 10 or later"}
            val consent=if(Build.VERSION.SDK_INT>=33)intent.getParcelableExtra("consent",Intent::class.java) else @Suppress("DEPRECATION") intent.getParcelableExtra("consent")
            require(consent!=null){"Phone audio sharing needs Android consent"}
            val manager=getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            val playbackProjection=manager.getMediaProjection(Activity.RESULT_OK,consent);projection=playbackProjection
            playbackProjection.registerCallback(object:MediaProjection.Callback(){override fun onStop(){main.post{if(!stopped)stop(kind)}}},main)
            val capture=AudioPlaybackCaptureConfiguration.Builder(playbackProjection)
                .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
                .addMatchingUsage(AudioAttributes.USAGE_GAME)
                .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
                .build()
            val rate=48000
            val format=AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(rate).setChannelMask(AudioFormat.CHANNEL_IN_STEREO).build()
            val minimum=AudioRecord.getMinBufferSize(rate,AudioFormat.CHANNEL_IN_STEREO,AudioFormat.ENCODING_PCM_16BIT)
            require(minimum>0){"Phone playback audio format unavailable"}
            val audio=AudioRecord.Builder().setAudioFormat(format).setBufferSizeInBytes(maxOf(minimum*2,19200)).setAudioPlaybackCaptureConfig(capture).build();recorder=audio
            require(audio.state==AudioRecord.STATE_INITIALIZED){"Phone playback audio unavailable"};audio.startRecording()
            require(audio.recordingState==AudioRecord.RECORDSTATE_RECORDING){"Phone playback capture did not start"}
            Thread({try{
                val block=ByteArray(7680)
                while(!stopped){var used=0;while(used<block.size&&!stopped){val count=audio.read(block,used,block.size-used,AudioRecord.READ_BLOCKING);if(count<0)throw IllegalStateException("Phone playback capture stopped ($count)");used+=count};if(used==block.size&&!stopped)queuePlayback(block.copyOf(),rate,2)}
            }catch(e:Exception){if(!stopped)fail(kind,e)}},"MOHIVX-phone-playback").start()
        }
        private fun queuePlayback(bytes:ByteArray,rate:Int,channels:Int){
            synchronized(audioQueue){while(audioQueue.size>=6)audioQueue.removeFirst();audioQueue.addLast(bytes)}
            startAudioDrain(rate,channels)
        }
        private fun startAudioDrain(rate:Int,channels:Int){
            if(!audioSending.compareAndSet(false,true))return
            transport.execute{try{
                while(!stopped){val bytes=synchronized(audioQueue){if(audioQueue.isEmpty())null else audioQueue.removeFirst()}?:break
                    try{val body=JSONObject().put("streamId",streamId).put("data",Base64.encodeToString(bytes,Base64.NO_WRAP)).put("rate",rate).put("channels",channels);client.request("/api/phone-audio",body);transportFailures=0}
                    catch(e:Exception){if(e is java.net.SocketTimeoutException||e is java.net.ConnectException||e is java.net.SocketException){transportFailures++;if(transportFailures>=3){fail(kind,e);break}}else{fail(kind,e);break}}
                }
            }finally{audioSending.set(false);if(!stopped&&synchronized(audioQueue){audioQueue.isNotEmpty()})startAudioDrain(rate,channels)}}
        }
        private fun screen(intent:Intent){
            val consent=if(Build.VERSION.SDK_INT>=33)intent.getParcelableExtra("consent",Intent::class.java) else @Suppress("DEPRECATION") intent.getParcelableExtra("consent")
            require(consent!=null){"Screen sharing needs Android consent"}
            val manager=getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            val screen=manager.getMediaProjection(Activity.RESULT_OK,consent);projection=screen
            val metrics=resources.displayMetrics;val scale=minOf(1f,960f/maxOf(metrics.widthPixels,metrics.heightPixels));val width=(metrics.widthPixels*scale).toInt().coerceAtLeast(2);val height=(metrics.heightPixels*scale).toInt().coerceAtLeast(2)
            val callback=background()
            screen.registerCallback(object:MediaProjection.Callback(){override fun onStop(){main.post{if(!stopped)stop(kind)}}},main)
            val images=ImageReader.newInstance(width,height,PixelFormat.RGBA_8888,2);reader=images
            images.setOnImageAvailableListener({source->val image=try{source.acquireLatestImage()}catch(_:Exception){null};if(image!=null)try{if(due()){val plane=image.planes[0];require(plane.pixelStride==4);val packed=java.nio.ByteBuffer.allocate(image.width*image.height*4);for(y in 0 until image.height){val row=plane.buffer.duplicate();row.position(y*plane.rowStride);row.limit(y*plane.rowStride+image.width*4);packed.put(row)};packed.flip();val bitmap=Bitmap.createBitmap(image.width,image.height,Bitmap.Config.ARGB_8888);bitmap.copyPixelsFromBuffer(packed);jpeg(bitmap)}}catch(e:Exception){fail(kind,e)}finally{image.close()}},callback)
            display=screen.createVirtualDisplay("MOHIVX Phone",width,height,metrics.densityDpi,DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,images.surface,null,callback)
        }
        @Suppress("MissingPermission") private fun camera(){
            val manager=getSystemService(CAMERA_SERVICE) as CameraManager
            val wanted=if(front)CameraCharacteristics.LENS_FACING_FRONT else CameraCharacteristics.LENS_FACING_BACK
            val id=manager.cameraIdList.firstOrNull{manager.getCameraCharacteristics(it).get(CameraCharacteristics.LENS_FACING)==wanted} ?: manager.cameraIdList.firstOrNull() ?: throw IllegalStateException("No camera found")
            val info=manager.getCameraCharacteristics(id);sensorRotation=info.get(CameraCharacteristics.SENSOR_ORIENTATION) ?: 0
            val sizes=info.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)?.getOutputSizes(ImageFormat.YUV_420_888) ?: throw IllegalStateException("Camera format unavailable")
            val size=sizes.filter{it.width<=640&&it.height<=480}.maxByOrNull{it.width*it.height} ?: sizes.minByOrNull{it.width*it.height}!!
            val callback=background();val images=ImageReader.newInstance(size.width,size.height,ImageFormat.YUV_420_888,2);reader=images
            images.setOnImageAvailableListener({source->val image=try{source.acquireLatestImage()}catch(_:Exception){null};if(image!=null)try{if(due())cameraFrame(image)}catch(e:Exception){fail(kind,e)}finally{image.close()}},callback)
            manager.openCamera(id,object:CameraDevice.StateCallback(){
                override fun onOpened(device:CameraDevice){if(stopped){device.close();return};camera=device
                    try{device.createCaptureSession(listOf(images.surface),object:CameraCaptureSession.StateCallback(){
                        override fun onConfigured(session:CameraCaptureSession){if(stopped){session.close();return};cameraSession=session;try{val request=device.createCaptureRequest(CameraDevice.TEMPLATE_RECORD).apply{addTarget(images.surface);set(CaptureRequest.CONTROL_MODE,CaptureRequest.CONTROL_MODE_AUTO)
                            if(info.get(CameraCharacteristics.CONTROL_AF_AVAILABLE_MODES)?.contains(CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_VIDEO)==true)set(CaptureRequest.CONTROL_AF_MODE,CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_VIDEO)
                            info.get(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES)?.filter{it.lower<=15&&it.upper>=15}?.minByOrNull{it.upper-it.lower}?.let{set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE,it)}
                        };session.setRepeatingRequest(request.build(),null,callback)}catch(e:Exception){fail(kind,e)}}
                        override fun onConfigureFailed(session:CameraCaptureSession){fail(kind,IllegalStateException("Camera configuration failed"))}
                    },callback)}catch(e:Exception){fail(kind,e)}
                }
                override fun onDisconnected(device:CameraDevice){device.close();fail(kind,IllegalStateException("Camera disconnected"))}
                override fun onError(device:CameraDevice,error:Int){device.close();fail(kind,IllegalStateException("Camera unavailable ($error)"))}
            },callback)
        }
        private fun cameraFrame(image:Image){
            val w=image.width;val h=image.height;val planes=image.planes
            val nv21=FramePixels.nv21(w,h,planes[0].buffer,planes[0].rowStride,planes[0].pixelStride,planes[1].buffer,planes[1].rowStride,planes[1].pixelStride,planes[2].buffer,planes[2].rowStride,planes[2].pixelStride)
            val rotation=when((getSystemService(WINDOW_SERVICE) as WindowManager).defaultDisplay.rotation){Surface.ROTATION_90->90;Surface.ROTATION_180->180;Surface.ROTATION_270->270;else->0}
            val angle=if(front)(sensorRotation+rotation)%360 else (sensorRotation-rotation+360)%360
            val pixels=FramePixels.orient(nv21,w,h,angle,front);val rw=if(angle==90||angle==270)h else w;val rh=if(angle==90||angle==270)w else h
            val out=ByteArrayOutputStream();YuvImage(pixels,ImageFormat.NV21,rw,rh,null).compressToJpeg(Rect(0,0,rw,rh),65,out)
            if(out.size()<750000)send(out.toByteArray())
        }

        fun close(){
            if(stopped)return;stopped=true
            synchronized(audioQueue){audioQueue.clear()}
            try{recorder?.stop()}catch(_:Exception){};try{recorder?.release()}catch(_:Exception){};recorder=null
            try{cameraSession?.close()}catch(_:Exception){};try{camera?.close()}catch(_:Exception){}
            try{display?.release()}catch(_:Exception){};try{projection?.stop()}catch(_:Exception){};try{reader?.close()}catch(_:Exception){};thread?.quitSafely()
            transport.execute{try{if(streamId.isNotEmpty())client.request("/api/phone-stop",JSONObject().put("kind",kind))}catch(_:Exception){}};transport.shutdown()
        }
    }
}
