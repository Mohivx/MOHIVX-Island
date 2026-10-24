package com.mohivx.island.companion

import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract as Docs
import android.provider.MediaStore
import org.json.JSONArray
import org.json.JSONObject

class PhoneFiles(private val context:Context){
 private data class Entry(val uri:Uri,val directory:Boolean,val name:String)
 private val entries=linkedMapOf<String,Entry>()
 private var tree=""
 private fun remember(uri:Uri,directory:Boolean,name:String):String {val key=java.security.MessageDigest.getInstance("SHA-256").digest(uri.toString().toByteArray()).joinToString(""){"%02x".format(it)};if(entries.size>=10000&&!entries.containsKey(key))throw IllegalStateException("Too many files. Restart sync.");entries[key]=Entry(uri,directory,name);return key}
 private val prefs get()=context.getSharedPreferences("ui",Context.MODE_PRIVATE)
 fun photosAllowed():Boolean {val permission=if(android.os.Build.VERSION.SDK_INT>=33)android.Manifest.permission.READ_MEDIA_IMAGES else android.Manifest.permission.READ_EXTERNAL_STORAGE;return context.checkSelfPermission(permission)==android.content.pm.PackageManager.PERMISSION_GRANTED||(android.os.Build.VERSION.SDK_INT>=34&&context.checkSelfPermission(android.Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED)==android.content.pm.PackageManager.PERMISSION_GRANTED)}
 fun allFilesAllowed()=android.os.Build.VERSION.SDK_INT>=30&&prefs.getBoolean("phoneAllFiles",false)&&android.os.Environment.isExternalStorageManager()
 fun folderAllowed()=allFilesAllowed()||prefs.getString("phoneFolder","").orEmpty().isNotEmpty()
 fun execute(command:JSONObject):JSONObject=when(command.getString("type")){"photos.list"->photos(command.optInt("offset"));"files.list"->list(command.optString("parent"),command.optInt("offset"));"files.read"->read(command);else->throw IllegalArgumentException("Unknown file request.")}
 private fun photos(offset:Int):JSONObject {
  check(photosAllowed()){"Allow photos in the phone app first."};require(offset in 0..100000)
  val items=JSONArray();var more=false
  context.contentResolver.query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,arrayOf("_id","_display_name","_size"),null,null,"date_added DESC")?.use{cursor->
   if(offset>0)cursor.moveToPosition(offset-1)
   while(items.length()<12&&cursor.moveToNext()){
    val uri=android.content.ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,cursor.getLong(0));val name=cursor.getString(1)?:"Photo.jpg"
    val item=JSONObject().put("id",remember(uri,false,name)).put("name",name).put("size",cursor.getLong(2)).put("directory",false)
    try{val bitmap=if(android.os.Build.VERSION.SDK_INT>=29)context.contentResolver.loadThumbnail(uri,android.util.Size(192,192),null)else MediaStore.Images.Thumbnails.getThumbnail(context.contentResolver,cursor.getLong(0),MediaStore.Images.Thumbnails.MICRO_KIND,null);if(bitmap!=null){val out=java.io.ByteArrayOutputStream();bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG,65,out);if(out.size()<60000)item.put("thumbnail","data:image/jpeg;base64,"+android.util.Base64.encodeToString(out.toByteArray(),android.util.Base64.NO_WRAP));bitmap.recycle()}}catch(_:Exception){}
    items.put(item)
   };more=cursor.moveToNext()
  };return JSONObject().put("items",items).put("next",if(more)offset+items.length()else 0)
 }
 private fun list(parent:String,offset:Int):JSONObject {
  if(allFilesAllowed())return sharedStorage(parent,offset)
  require(offset in 0..100000);val selected=context.getSharedPreferences("ui",Context.MODE_PRIVATE).getString("phoneFolder","").orEmpty();check(selected.isNotEmpty()){"Choose a shared folder in the phone app first."}
  if(selected!=tree){tree=selected;entries.clear()}
  val root=Uri.parse(selected);val uri=if(parent.isEmpty())Docs.buildDocumentUriUsingTree(root,Docs.getTreeDocumentId(root))else entries[parent]?.takeIf{it.directory}?.uri?:throw IllegalArgumentException("Open the shared folder again.")
  val children=Docs.buildChildDocumentsUriUsingTree(root,Docs.getDocumentId(uri));val rows=mutableListOf<JSONObject>()
  context.contentResolver.query(children,arrayOf(Docs.Document.COLUMN_DOCUMENT_ID,Docs.Document.COLUMN_DISPLAY_NAME,Docs.Document.COLUMN_MIME_TYPE,Docs.Document.COLUMN_SIZE),null,null,null)?.use{c->
   while(c.moveToNext()&&rows.size<10000){val child=Docs.buildDocumentUriUsingTree(root,c.getString(0));val name=c.getString(1)?:"File";val directory=c.getString(2)==Docs.Document.MIME_TYPE_DIR;rows.add(JSONObject().put("id",remember(child,directory,name)).put("name",name).put("directory",directory).put("size",c.getLong(3)))}
  };rows.sortWith(compareBy<JSONObject>({!it.getBoolean("directory")},{it.getString("name").lowercase()}));val page=rows.drop(offset).take(50)
  return JSONObject().put("items",JSONArray(page)).put("next",if(offset+page.size<rows.size)offset+page.size else 0)
 }
 private fun sharedStorage(parent:String,offset:Int):JSONObject {
  require(offset in 0..100000);if(tree!="ALL"){tree="ALL";entries.clear()}
  val root=android.os.Environment.getExternalStorageDirectory().canonicalFile
  val folder=if(parent.isEmpty())root else entries[parent]?.takeIf{it.directory&&it.uri.scheme=="file"}?.uri?.path?.let{java.io.File(it).canonicalFile}?:throw IllegalArgumentException("Open shared storage again.")
  fun allowed(file:java.io.File):Boolean{val p=file.canonicalPath;return (p==root.path||p.startsWith(root.path+java.io.File.separator))&&!p.startsWith(root.path+"/Android/data")&&!p.startsWith(root.path+"/Android/obb")}
  check(allowed(folder)&&folder.isDirectory){"Folder unavailable."}
  val rows=(folder.listFiles()?:emptyArray()).filter{try{allowed(it)&&it.canRead()}catch(_:Exception){false}}.sortedWith(compareBy<java.io.File>({!it.isDirectory},{it.name.lowercase()}))
  val page=rows.drop(offset).take(50).map{JSONObject().put("id",remember(Uri.fromFile(it.canonicalFile),it.isDirectory,it.name)).put("name",it.name).put("directory",it.isDirectory).put("size",if(it.isDirectory)0 else it.length())}
  return JSONObject().put("items",JSONArray(page)).put("next",if(offset+page.size<rows.size)offset+page.size else 0)
 }
 private fun read(command:JSONObject):JSONObject {
  val item=entries[command.getString("id")]?.takeIf{!it.directory}?:throw IllegalArgumentException("Select the file again.");val offset=command.optLong("offset");require(offset in 0..2147483648L)
  if(item.uri.scheme=="file")check(allFilesAllowed()){"Shared storage access was disabled."}
  else if(item.uri.authority==MediaStore.AUTHORITY)check(photosAllowed()){"Photos access was disabled."}
  else check(prefs.getString("phoneFolder","").orEmpty().isNotEmpty()){"Shared folder was disconnected."}
  val bytes=ByteArray(98304);var count=0;context.contentResolver.openInputStream(item.uri)?.use{input->var remaining=offset;while(remaining>0){val skipped=input.skip(remaining);if(skipped>0)remaining-=skipped else{if(input.read()==-1)throw IllegalArgumentException("File changed.");remaining--}};while(count<bytes.size){val n=input.read(bytes,count,bytes.size-count);if(n<0)break;count+=n}}?:throw IllegalStateException("File unavailable.")
  return JSONObject().put("data",android.util.Base64.encodeToString(bytes,0,count,android.util.Base64.NO_WRAP)).put("offset",offset).put("eof",count<bytes.size)
 }
}
