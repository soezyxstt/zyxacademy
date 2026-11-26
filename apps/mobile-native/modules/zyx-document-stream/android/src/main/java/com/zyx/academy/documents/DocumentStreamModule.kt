package com.zyx.academy.documents

import android.content.ContentResolver
import android.net.Uri
import android.os.CancellationSignal
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.IOException
import java.io.InputStream
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

// Some Storage Access Framework providers return a pipe and report no length.
// Sequential reads also work for ordinary seekable documents.
private class PickedStream(private val uri: Uri) {
  private val cancel = CancellationSignal()
  private val readLock = Any()
  private var stream: InputStream? = null

  private fun input(resolver: ContentResolver): InputStream {
    synchronized(this) {
      cancel.throwIfCanceled()
      stream?.let { return it }
    }
    val descriptor = resolver.openAssetFileDescriptor(uri, "r", cancel)
      ?: throw IOException("Document unavailable")
    val opened = try {
      descriptor.createInputStream()
    } catch (e: Exception) {
      descriptor.close()
      throw e
    }
    synchronized(this) {
      if (cancel.isCanceled) {
        opened.close()
        throw IOException("Document closed")
      }
      stream = opened
      return opened
    }
  }

  fun read(resolver: ContentResolver): ByteArray = synchronized(readLock) {
    val bytes = ByteArray(64 * 1024)
    val count = input(resolver).read(bytes)
    if (count == bytes.size) bytes else bytes.copyOf(count.coerceAtLeast(0))
  }

  fun close() {
    cancel.cancel()
    synchronized(this) {
      try {
        stream?.close()
      } finally {
        stream = null
      }
    }
  }
}

class DocumentStreamModule : Module() {
  private val streams = ConcurrentHashMap<String, PickedStream>()

  override fun definition() = ModuleDefinition {
    Name("ZyxDocumentStream")

    Function("begin") { value: String ->
      val uri = Uri.parse(value)
      require(uri.scheme == ContentResolver.SCHEME_CONTENT && !uri.authority.isNullOrEmpty())
      val id = UUID.randomUUID().toString()
      streams[id] = PickedStream(uri)
      id
    }

    AsyncFunction("read") Coroutine { id: String ->
      val source = streams[id] ?: throw IOException("Document closed")
      val resolver = appContext.reactContext?.contentResolver ?: throw IOException("App unavailable")
      withContext(Dispatchers.IO) { source.read(resolver) }
    }

    Function("close") { id: String -> streams.remove(id)?.close() }

    OnDestroy {
      streams.values.forEach { runCatching { it.close() } }
      streams.clear()
    }
  }
}
