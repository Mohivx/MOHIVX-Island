package com.mohivx.island.companion

import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract as Docs
import android.provider.MediaStore
import org.json.JSONArray
import org.json.JSONObject

class PhoneFiles(private val context:Context){
 private data class Entry(val uri:Uri,val directory:Boolean,val name:String)
 private data class Upload(val uri:Uri,val output:java.io.OutputStream,val name:String,val size:Long,var offset:Long)
 private val entries=linkedMapOf<String,Entry>()
 private val uploads=linkedMapOf<String,Upload>()
 private var tree=""
 private fun remember(uri:Uri,directory:Boolean,name:String):String {val key=java.security.MessageDigest.getInstance("SHA-256").digest(uri.toString().toByteArray()).joinToString(""){"%02x".format(it)};if(entries.size>=10000&&!entries.containsKey(key))throw IllegalStateException("Too many files. Restart sync.");entries[key]=Entry(uri,directory,name);return key}
 private val prefs get()=context.getSharedPreferences("ui",Context.MODE_PRIVATE)
 fun photosAllowed():Boolean {val permission=if(android.os.Build.VERSION.SDK_INT>=33)android.Manifest.permission.READ_MEDIA_IMAGES else android.Manifest.permission.READ_EXTERNAL_STORAGE;return context.checkSelfPermission(permission)==android.content.pm.PackageManager.PERMISSION_GRANTED||(android.os.Build.VERSION.SDK_INT>=34&&context.checkSelfPermission(android.Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED)==android.content.pm.PackageManager.PERMISSION_GRANTED)}
 fun allFilesAllowed()=android.os.Build.VERSION.SDK_INT>=30&&prefs.getBoolean("phoneAllFiles",false)&&android.os.Environment.isExternalStorageManager()
 private fun selectedFolder()=prefs.getString("phoneFolder","").orEmpty()
 private fun persistedTreePermission(write:Boolean):Boolean {val selected=selectedFolder();if(selected.isEmpty())return false;return context.contentResolver.persistedUriPermissions.any{it.uri.toString()==selected&&it.isReadPermission&&(!write||it.isWritePermission)}}
 fun folderAllowed()=allFilesAllowed()||persistedTreePermission(false)
 fun folderWriteAllowed()=allFilesAllowed()||persistedTreePermission(true)
 fun execute(command:JSONObject):JSONObject=when(command.getString("type")){"photos.list"->photos(command.optInt("offset"));"files.list"->list(command.optString("parent"),command.optInt("offset"));"files.read"->read(command);"files.write"->write(command);"files.abort"->abort(command.optString("transferId"));"files.mkdir"->mkdir(command);"files.rename"->rename(command);else->throw IllegalArgumentException("Unknown file request.")}
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
 private fun write(command:JSONObject):JSONObject {
  check(folderWriteAllowed()){"Choose a shared folder with write access in the phone app first."}
  val transfer=command.getString("transferId");val name=command.getString("name");val parent=command.optString("parent");val size=command.getLong("size");val offset=command.getLong("offset");val bytes=try{android.util.Base64.decode(command.getString("data"),android.util.Base64.DEFAULT)}catch(_:Exception){throw IllegalArgumentException("Invalid file data.")};val eof=command.getBoolean("eof")
  require(size in 0..2147483648L&&offset>=0&&offset+bytes.size<=size&&bytes.size<=49152&&eof==(offset+bytes.size==size)){"Invalid file chunk."}
  val selected=selectedFolder();val rootKey=if(allFilesAllowed())"ALL" else selected;if(rootKey!=tree){tree=rootKey;entries.clear();uploads.values.forEach{try{it.output.close()}catch(_:Exception){};deleteDocument(it.uri)};uploads.clear()}
  if(offset==0L){require(!uploads.containsKey(transfer)&&uploads.size<2){"Too many active file transfers."};val uri=if(allFilesAllowed())createSharedStorageUpload(transfer,parent)else createTreeUpload(name,parent);val output=if(uri.scheme=="file")java.io.FileOutputStream(java.io.File(uri.path?:throw IllegalStateException("Could not open the temporary file.")))else context.contentResolver.openOutputStream(uri,"wa");if(output==null){deleteDocument(uri);throw IllegalStateException("Could not write to the selected folder.")};uploads[transfer]=Upload(uri,output,name,size,0)}
  val upload=uploads[transfer]?:throw IllegalArgumentException("File transfer expired. Start again.")
  require(upload.name==name&&upload.size==size&&upload.offset==offset){"File chunks arrived out of order."}
  try{if(bytes.isNotEmpty())upload.output.write(bytes);upload.offset+=bytes.size;if(eof){upload.output.flush();upload.output.close();val finalUri=finishUpload(upload);uploads.remove(transfer);return JSONObject().put("offset",offset).put("nextOffset",upload.offset).put("complete",true).put("name",queryName(finalUri)?:name)};return JSONObject().put("offset",offset).put("nextOffset",upload.offset).put("complete",false)}catch(error:Exception){uploads.remove(transfer);try{upload.output.close()}catch(_:Exception){};deleteDocument(upload.uri);throw error}
 }
 private fun mkdir(command:JSONObject):JSONObject {
  check(folderWriteAllowed()){"Choose a shared folder with write access in the phone app first."}
  val name=validName(command.getString("name"));val parent=command.optString("parent");val rootKey=if(allFilesAllowed())"ALL" else selectedFolder()
  check(rootKey.isNotEmpty()){"Choose a shared folder in the phone app first."}
  if(rootKey!=tree){tree=rootKey;entries.clear();uploads.values.forEach{try{it.output.close()}catch(_:Exception){};deleteDocument(it.uri)};uploads.clear()}
  if(allFilesAllowed()){
   val root=android.os.Environment.getExternalStorageDirectory().canonicalFile
   val folder=if(parent.isEmpty())root else entries[parent]?.takeIf{it.directory&&it.uri.scheme=="file"}?.uri?.path?.let{java.io.File(it).canonicalFile}?:throw IllegalArgumentException("Choose the shared folder again.")
   check(allowedShared(folder)&&folder.isDirectory&&folder.canWrite()){"Folder unavailable."}
   val target=java.io.File(folder,name);check(allowedShared(target)&&!target.exists()&&target.mkdir()){"Could not create the folder."}
  }else{
   check(persistedTreePermission(true)){"Choose a shared folder with write access in the phone app first."}
   val root=Uri.parse(selectedFolder());val parentUri=if(parent.isEmpty())Docs.buildDocumentUriUsingTree(root,Docs.getTreeDocumentId(root))else entries[parent]?.takeIf{it.directory}?.uri?:throw IllegalArgumentException("Choose the shared folder again.")
   check(Docs.createDocument(context.contentResolver,parentUri,Docs.Document.MIME_TYPE_DIR,name)!=null){"Could not create the folder."}
  }
  return JSONObject().put("created",true).put("name",name).put("directory",true)
 }
 private fun rename(command:JSONObject):JSONObject {
  check(folderWriteAllowed()){"Choose a shared folder with write access in the phone app first."}
  val id=command.getString("itemId");val name=validName(command.getString("name"));val entry=entries[id]?:throw IllegalArgumentException("Open the folder again and choose the item to rename.")
  val rootKey=if(allFilesAllowed())"ALL" else selectedFolder();check(rootKey.isNotEmpty()){"Choose a shared folder in the phone app first."}
  if(rootKey!=tree){tree=rootKey;entries.clear();throw IllegalArgumentException("Open the folder again and choose the item to rename.")}
  val renamedUri:Uri
  if(entry.uri.scheme=="file"){
   check(allFilesAllowed()){"Shared storage access was disabled."}
   val source=java.io.File(entry.uri.path?:throw IllegalArgumentException("Open the folder again.")).canonicalFile
   check(allowedShared(source)&&source.exists()){"File or folder unavailable."}
   val target=java.io.File(source.parentFile?:throw IllegalArgumentException("Could not rename the item."),name).canonicalFile
   if(target.path!=source.path)check(allowedShared(target)&&!target.exists()&&source.renameTo(target)){"Could not rename the item."}
   renamedUri=Uri.fromFile(target)
  }else{
   check(persistedTreePermission(true)){"Choose a shared folder with write access in the phone app first."}
   renamedUri=Docs.renameDocument(context.contentResolver,entry.uri,name)?:throw IllegalStateException("The selected folder could not rename this item.")
  }
  entries.clear();val renamedId=remember(renamedUri,entry.directory,name)
  return JSONObject().put("renamed",true).put("id",renamedId).put("name",name).put("directory",entry.directory)
 }
 private fun validName(value:String):String {
  val name=value.trim();require(name.isNotEmpty()&&name.length<=160&&name!="."&&name!=".."&&!name.any{it=='/'||it=='\\'||it=='<'||it=='>'||it==':'||it=='"'||it=='|'||it=='?'||it=='*'||it.code<32}&&!name.endsWith('.')&&!name.endsWith(' ')){"Choose a valid name for the phone item."};return name
 }
 private fun allowedShared(file:java.io.File):Boolean {
  val root=android.os.Environment.getExternalStorageDirectory().canonicalFile;val path=file.canonicalPath
  return (path==root.path||path.startsWith(root.path+java.io.File.separator))&&!path.startsWith(root.path+"/Android/data")&&!path.startsWith(root.path+"/Android/obb")
 }
 private fun createTreeUpload(name:String,parent:String):Uri {
  check(persistedTreePermission(true)){"Choose a shared folder with write access in the phone app first."};val root=Uri.parse(selectedFolder());if(root.toString()!=tree){tree=root.toString();entries.clear()};val parentUri=if(parent.isEmpty())Docs.buildDocumentUriUsingTree(root,Docs.getTreeDocumentId(root))else entries[parent]?.takeIf{it.directory}?.uri?:throw IllegalArgumentException("Choose the shared folder again.")
  val mime=android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substringAfterLast('.',"").lowercase())?:"application/octet-stream";return Docs.createDocument(context.contentResolver,parentUri,mime,name)?:throw IllegalStateException("The selected folder could not create a file.")
 }
 private fun createSharedStorageUpload(transfer:String,parent:String):Uri {
  check(allFilesAllowed()){"Shared storage access was disabled."};if(tree!="ALL"){tree="ALL";entries.clear()};val root=android.os.Environment.getExternalStorageDirectory().canonicalFile;val folder=if(parent.isEmpty())root else entries[parent]?.takeIf{it.directory&&it.uri.scheme=="file"}?.uri?.path?.let{java.io.File(it).canonicalFile}?:throw IllegalArgumentException("Choose the shared folder again.")
  fun allowed(file:java.io.File)= (file.canonicalPath==root.path||file.canonicalPath.startsWith(root.path+java.io.File.separator))&&!file.canonicalPath.startsWith(root.path+"/Android/data")&&!file.canonicalPath.startsWith(root.path+"/Android/obb")
  check(allowed(folder)&&folder.isDirectory){"Folder unavailable."};val target=java.io.File(folder,".mohivx-$transfer.part");check(allowed(target)&&!target.exists()){"Could not create a temporary file."};return Uri.fromFile(target)
 }
 private fun finishUpload(upload:Upload):Uri {
  if(upload.uri.scheme=="file"){val target=java.io.File(upload.uri.path?:throw IllegalStateException("Could not find the temporary file."));val final=java.io.File(target.parentFile,upload.name);if(final.exists()||!target.renameTo(final))throw IllegalStateException("Could not finish writing the file.");return Uri.fromFile(final)}
  return upload.uri
 }
 private fun abort(transfer:String):JSONObject {val upload=uploads.remove(transfer);if(upload!=null){try{upload.output.close()}catch(_:Exception){};deleteDocument(upload.uri)};return JSONObject().put("aborted",upload!=null)}
 private fun deleteDocument(uri:Uri){try{if(uri.scheme=="file")uri.path?.let{java.io.File(it).delete()}else Docs.deleteDocument(context.contentResolver,uri)}catch(_:Exception){}}
 private fun queryName(uri:Uri):String?=try{context.contentResolver.query(uri,arrayOf(Docs.Document.COLUMN_DISPLAY_NAME),null,null,null)?.use{if(it.moveToFirst())it.getString(0)else null}}catch(_:Exception){null}
}
