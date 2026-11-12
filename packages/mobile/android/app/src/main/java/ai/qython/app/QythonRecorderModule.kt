package ai.qython.app

import android.Manifest
import android.content.pm.PackageManager
import android.media.MediaRecorder
import android.os.Build
import android.os.SystemClock
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

/**
 * Grava a voz do ditado num arquivo m4a (AAC mono, 16 kHz) no cache do app. O JavaScript manda esse
 * arquivo ao computador pareado, que o transcreve com o whisper local; depois ele é apagado ([discard]).
 *
 * Existe no lugar do reconhecedor de voz do Android, que envia o áudio para a nuvem do fabricante: aqui
 * a gravação nunca sai do aparelho a não ser para o computador do próprio médico.
 *
 * Uma gravação por vez. Se o app vai para o segundo plano, a gravação é descartada: o microfone não deve
 * ficar aberto escondido, e o JavaScript fica sabendo porque [stop] responde E_NOT_RECORDING.
 */
class QythonRecorderModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

    private val lock = Any()
    private var recorder: MediaRecorder? = null
    private var file: File? = null
    private var startedAt = 0L

    init {
        reactContext.addLifecycleEventListener(this)
    }

    override fun getName(): String = NAME

    @ReactMethod
    fun start(promise: Promise) {
        synchronized(lock) {
            if (recorder != null) {
                promise.reject("E_BUSY", "Já existe uma gravação em andamento.")
                return
            }
            if (ContextCompat.checkSelfPermission(reactContext, Manifest.permission.RECORD_AUDIO) !=
                PackageManager.PERMISSION_GRANTED
            ) {
                promise.reject("E_PERMISSION", "Sem permissão para usar o microfone.")
                return
            }
            val out = File(reactContext.cacheDir, "$PREFIX${System.currentTimeMillis()}.m4a")
            val rec = newRecorder()
            try {
                rec.setAudioSource(MediaRecorder.AudioSource.MIC)
                rec.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                rec.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                rec.setAudioChannels(1)
                rec.setAudioSamplingRate(16000)
                rec.setAudioEncodingBitRate(48000)
                rec.setMaxDuration(MAX_MS)
                rec.setOutputFile(out.absolutePath)
                rec.prepare()
                rec.start()
            } catch (e: Exception) {
                release(rec)
                out.delete()
                promise.reject("E_START", "Não foi possível abrir o microfone.", e)
                return
            }
            recorder = rec
            file = out
            startedAt = SystemClock.elapsedRealtime()
            promise.resolve(null)
        }
    }

    /** Encerra a gravação e devolve { uri, durationMs, sizeBytes }. */
    @ReactMethod
    fun stop(promise: Promise) {
        val rec: MediaRecorder?
        val out: File?
        val began: Long
        synchronized(lock) {
            rec = recorder
            out = file
            began = startedAt
            recorder = null
            file = null
        }
        if (rec == null || out == null) {
            promise.reject("E_NOT_RECORDING", "Não há gravação em andamento.")
            return
        }
        val duration = SystemClock.elapsedRealtime() - began
        try {
            rec.stop()
        } catch (e: RuntimeException) {
            // O MediaRecorder lança se parou antes de captar qualquer áudio.
            release(rec)
            out.delete()
            promise.reject("E_TOO_SHORT", "A gravação ficou curta demais.", e)
            return
        }
        release(rec)
        val result = Arguments.createMap()
        result.putString("uri", "file://" + out.absolutePath)
        result.putDouble("durationMs", duration.toDouble())
        result.putDouble("sizeBytes", out.length().toDouble())
        promise.resolve(result)
    }

    /** Descarta a gravação em andamento, se houver. */
    @ReactMethod
    fun cancel(promise: Promise) {
        cancelNow()
        promise.resolve(null)
    }

    /** Apaga um arquivo de ditado já enviado. Ignora qualquer caminho que não seja um áudio daqui. */
    @ReactMethod
    fun discard(uri: String, promise: Promise) {
        try {
            val target = File(uri.removePrefix("file://")).canonicalFile
            val cache = reactContext.cacheDir.canonicalFile
            if (target.parentFile == cache && target.name.startsWith(PREFIX)) {
                target.delete()
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("E_DISCARD", e.message, e)
        }
    }

    private fun cancelNow() {
        val rec: MediaRecorder?
        val out: File?
        synchronized(lock) {
            rec = recorder
            out = file
            recorder = null
            file = null
        }
        if (rec != null) {
            try {
                rec.stop()
            } catch (_: RuntimeException) {
                // Sem áudio captado: nada a parar.
            }
            release(rec)
        }
        out?.delete()
    }

    private fun newRecorder(): MediaRecorder =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(reactContext)
        } else {
            @Suppress("DEPRECATION")
            MediaRecorder()
        }

    private fun release(rec: MediaRecorder) {
        try {
            rec.release()
        } catch (_: Exception) {
            // Já liberado.
        }
    }

    override fun onHostPause() = cancelNow()

    override fun onHostResume() {}

    override fun onHostDestroy() = cancelNow()

    override fun invalidate() {
        cancelNow()
        reactContext.removeLifecycleEventListener(this)
        super.invalidate()
    }

    companion object {
        const val NAME = "QythonRecorder"
        private const val PREFIX = "ditado-"

        // Trava de segurança: a tela já corta em 2 minutos; o MediaRecorder para sozinho um pouco depois.
        private const val MAX_MS = 130_000
    }
}
