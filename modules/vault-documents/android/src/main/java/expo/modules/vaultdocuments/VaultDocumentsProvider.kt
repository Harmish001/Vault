package expo.modules.vaultdocuments

import android.database.Cursor
import android.database.MatrixCursor
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.provider.DocumentsContract
import android.provider.DocumentsProvider
import java.io.File
import java.io.FileNotFoundException

class VaultDocumentsProvider : DocumentsProvider() {
  companion object {
    const val ROOT_ID = "docvault_root"
    const val DOC_ID_ROOT = "root"
    private const val FOLDER_PREFIX = "folder:"
    private const val FILE_PREFIX = "file:"

    private val DEFAULT_ROOT_PROJECTION = arrayOf(
      DocumentsContract.Root.COLUMN_ROOT_ID,
      DocumentsContract.Root.COLUMN_ICON,
      DocumentsContract.Root.COLUMN_TITLE,
      DocumentsContract.Root.COLUMN_FLAGS,
      DocumentsContract.Root.COLUMN_DOCUMENT_ID,
      DocumentsContract.Root.COLUMN_MIME_TYPES
    )

    private val DEFAULT_DOCUMENT_PROJECTION = arrayOf(
      DocumentsContract.Document.COLUMN_DOCUMENT_ID,
      DocumentsContract.Document.COLUMN_DISPLAY_NAME,
      DocumentsContract.Document.COLUMN_MIME_TYPE,
      DocumentsContract.Document.COLUMN_FLAGS,
      DocumentsContract.Document.COLUMN_SIZE,
      DocumentsContract.Document.COLUMN_LAST_MODIFIED
    )
  }

  override fun onCreate(): Boolean = true

  override fun queryRoots(projection: Array<String>?): Cursor {
    val result = MatrixCursor(projection ?: DEFAULT_ROOT_PROJECTION)
    val ctx = context ?: return result
    val data = DocumentStore.read(ctx) ?: return result
    if (!data.enabled) return result

    val row = result.newRow()
    row.add(DocumentsContract.Root.COLUMN_ROOT_ID, ROOT_ID)
    row.add(DocumentsContract.Root.COLUMN_ICON, ctx.applicationInfo.icon)
    row.add(DocumentsContract.Root.COLUMN_TITLE, "DocVault")
    row.add(
      DocumentsContract.Root.COLUMN_FLAGS,
      DocumentsContract.Root.FLAG_SUPPORTS_IS_CHILD or DocumentsContract.Root.FLAG_SUPPORTS_SEARCH
    )
    row.add(DocumentsContract.Root.COLUMN_DOCUMENT_ID, DOC_ID_ROOT)
    row.add(DocumentsContract.Root.COLUMN_MIME_TYPES, "*/*")
    return result
  }

  override fun queryDocument(documentId: String, projection: Array<String>?): Cursor {
    val result = MatrixCursor(projection ?: DEFAULT_DOCUMENT_PROJECTION)
    val ctx = context ?: return result
    val data = DocumentStore.read(ctx) ?: return result

    if (documentId == DOC_ID_ROOT) {
      val row = result.newRow()
      row.add(DocumentsContract.Document.COLUMN_DOCUMENT_ID, DOC_ID_ROOT)
      row.add(DocumentsContract.Document.COLUMN_DISPLAY_NAME, "DocVault")
      row.add(DocumentsContract.Document.COLUMN_MIME_TYPE, DocumentsContract.Document.MIME_TYPE_DIR)
      row.add(DocumentsContract.Document.COLUMN_FLAGS, 0)
      row.add(DocumentsContract.Document.COLUMN_SIZE, 0L)
      row.add(DocumentsContract.Document.COLUMN_LAST_MODIFIED, System.currentTimeMillis())
      return result
    }

    if (documentId.startsWith(FOLDER_PREFIX)) {
      val fId = documentId.removePrefix(FOLDER_PREFIX)
      val folder = data.folders.find { it.id == fId } ?: return result
      val row = result.newRow()
      row.add(DocumentsContract.Document.COLUMN_DOCUMENT_ID, documentId)
      row.add(DocumentsContract.Document.COLUMN_DISPLAY_NAME, folder.name)
      row.add(DocumentsContract.Document.COLUMN_MIME_TYPE, DocumentsContract.Document.MIME_TYPE_DIR)
      row.add(DocumentsContract.Document.COLUMN_FLAGS, 0)
      row.add(DocumentsContract.Document.COLUMN_SIZE, 0L)
      row.add(DocumentsContract.Document.COLUMN_LAST_MODIFIED, 0L)
      return result
    }

    if (documentId.startsWith(FILE_PREFIX)) {
      val fId = documentId.removePrefix(FILE_PREFIX)
      val file = data.files.find { it.id == fId } ?: return result
      val row = result.newRow()
      row.add(DocumentsContract.Document.COLUMN_DOCUMENT_ID, documentId)
      row.add(DocumentsContract.Document.COLUMN_DISPLAY_NAME, file.displayName)
      row.add(DocumentsContract.Document.COLUMN_MIME_TYPE, file.mime)
      row.add(DocumentsContract.Document.COLUMN_FLAGS, 0)
      row.add(DocumentsContract.Document.COLUMN_SIZE, file.size)
      row.add(DocumentsContract.Document.COLUMN_LAST_MODIFIED, file.addedAt)
      return result
    }

    return result
  }

  override fun queryChildDocuments(
    parentDocumentId: String,
    projection: Array<String>?,
    sortOrder: String?
  ): Cursor {
    val result = MatrixCursor(projection ?: DEFAULT_DOCUMENT_PROJECTION)
    val ctx = context ?: return result
    val data = DocumentStore.read(ctx) ?: return result

    if (parentDocumentId == DOC_ID_ROOT) {
      for (folder in data.folders.filter { it.parentId == null }) {
        val row = result.newRow()
        row.add(DocumentsContract.Document.COLUMN_DOCUMENT_ID, "$FOLDER_PREFIX${folder.id}")
        row.add(DocumentsContract.Document.COLUMN_DISPLAY_NAME, folder.name)
        row.add(DocumentsContract.Document.COLUMN_MIME_TYPE, DocumentsContract.Document.MIME_TYPE_DIR)
        row.add(DocumentsContract.Document.COLUMN_FLAGS, 0)
        row.add(DocumentsContract.Document.COLUMN_SIZE, 0L)
        row.add(DocumentsContract.Document.COLUMN_LAST_MODIFIED, 0L)
      }
      for (file in data.files.filter { it.folderId == null || it.folderId.isEmpty() }) {
        val row = result.newRow()
        row.add(DocumentsContract.Document.COLUMN_DOCUMENT_ID, "$FILE_PREFIX${file.id}")
        row.add(DocumentsContract.Document.COLUMN_DISPLAY_NAME, file.displayName)
        row.add(DocumentsContract.Document.COLUMN_MIME_TYPE, file.mime)
        row.add(DocumentsContract.Document.COLUMN_FLAGS, 0)
        row.add(DocumentsContract.Document.COLUMN_SIZE, file.size)
        row.add(DocumentsContract.Document.COLUMN_LAST_MODIFIED, file.addedAt)
      }
      return result
    }

    if (parentDocumentId.startsWith(FOLDER_PREFIX)) {
      val parentFolderId = parentDocumentId.removePrefix(FOLDER_PREFIX)
      for (folder in data.folders.filter { it.parentId == parentFolderId }) {
        val row = result.newRow()
        row.add(DocumentsContract.Document.COLUMN_DOCUMENT_ID, "$FOLDER_PREFIX${folder.id}")
        row.add(DocumentsContract.Document.COLUMN_DISPLAY_NAME, folder.name)
        row.add(DocumentsContract.Document.COLUMN_MIME_TYPE, DocumentsContract.Document.MIME_TYPE_DIR)
        row.add(DocumentsContract.Document.COLUMN_FLAGS, 0)
        row.add(DocumentsContract.Document.COLUMN_SIZE, 0L)
        row.add(DocumentsContract.Document.COLUMN_LAST_MODIFIED, 0L)
      }
      for (file in data.files.filter { it.folderId == parentFolderId }) {
        val row = result.newRow()
        row.add(DocumentsContract.Document.COLUMN_DOCUMENT_ID, "$FILE_PREFIX${file.id}")
        row.add(DocumentsContract.Document.COLUMN_DISPLAY_NAME, file.displayName)
        row.add(DocumentsContract.Document.COLUMN_MIME_TYPE, file.mime)
        row.add(DocumentsContract.Document.COLUMN_FLAGS, 0)
        row.add(DocumentsContract.Document.COLUMN_SIZE, file.size)
        row.add(DocumentsContract.Document.COLUMN_LAST_MODIFIED, file.addedAt)
      }
    }

    return result
  }

  override fun openDocument(
    documentId: String,
    mode: String,
    signal: CancellationSignal?
  ): ParcelFileDescriptor {
    val ctx = context ?: throw FileNotFoundException("No context available")
    val data = DocumentStore.read(ctx) ?: throw FileNotFoundException("DocVault is locked")

    if (!documentId.startsWith(FILE_PREFIX)) {
      throw FileNotFoundException("Unsupported document ID: $documentId")
    }

    val fileId = documentId.removePrefix(FILE_PREFIX)
    val doc = data.files.find { it.id == fileId } ?: throw FileNotFoundException("File not found in DocVault")

    val physicalFile = File(ctx.filesDir, "vault/files/${doc.storedAs}")
    if (!physicalFile.exists()) {
      throw FileNotFoundException("File not found on storage: ${doc.name}")
    }

    return ParcelFileDescriptor.open(physicalFile, ParcelFileDescriptor.MODE_READ_ONLY)
  }

  override fun querySearchDocuments(
    rootId: String,
    query: String,
    projection: Array<String>?
  ): Cursor {
    val result = MatrixCursor(projection ?: DEFAULT_DOCUMENT_PROJECTION)
    val ctx = context ?: return result
    val data = DocumentStore.read(ctx) ?: return result
    val q = query.trim().lowercase()
    if (q.isEmpty()) return result

    for (file in data.files) {
      if (file.displayName.lowercase().contains(q) || file.name.lowercase().contains(q) || file.searchTerms.lowercase().contains(q)) {
        val row = result.newRow()
        row.add(DocumentsContract.Document.COLUMN_DOCUMENT_ID, "$FILE_PREFIX${file.id}")
        row.add(DocumentsContract.Document.COLUMN_DISPLAY_NAME, file.displayName)
        row.add(DocumentsContract.Document.COLUMN_MIME_TYPE, file.mime)
        row.add(DocumentsContract.Document.COLUMN_FLAGS, 0)
        row.add(DocumentsContract.Document.COLUMN_SIZE, file.size)
        row.add(DocumentsContract.Document.COLUMN_LAST_MODIFIED, file.addedAt)
      }
    }
    return result
  }
}
