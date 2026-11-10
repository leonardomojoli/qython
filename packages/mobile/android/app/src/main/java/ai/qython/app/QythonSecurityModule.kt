package ai.qython.app

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import java.net.InetSocketAddress
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocket
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

/**
 * Ponte do JavaScript com o que só o Android faz direito para o pareamento: a confiança TLS fixada
 * pela impressão digital ([PinnedTls]), o cofre do Keystore ([SecureStore]) e a leitura do QR code.
 */
class QythonSecurityModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = NAME

    /** Passa a exigir, para "host:porta", o certificado com esta impressão digital (SHA-256, hex). */
    @ReactMethod
    fun setPin(hostPort: String, fingerprint: String, promise: Promise) {
        try {
            if (!Regex("[0-9a-fA-F]{64}").matches(fingerprint)) {
                promise.reject("E_PIN", "Impressão digital inválida.")
                return
            }
            PinnedTls.set(reactContext, hostPort, fingerprint)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("E_PIN", e.message, e)
        }
    }

    @ReactMethod
    fun removePin(hostPort: String, promise: Promise) {
        try {
            PinnedTls.remove(reactContext, hostPort)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("E_PIN", e.message, e)
        }
    }

    @ReactMethod
    fun clearPins(promise: Promise) {
        try {
            PinnedTls.clear(reactContext)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("E_PIN", e.message, e)
        }
    }

    /**
     * Lê o certificado que o servidor apresenta, SEM confiar nele, e devolve a impressão digital. Serve
     * ao pareamento digitado à mão: o médico compara o resultado com o que o computador mostra e só
     * então o celular passa a confiar. A impressão digital do QR code dispensa este passo.
     */
    @ReactMethod
    fun probeFingerprint(host: String, port: Double, promise: Promise) {
        Thread {
            try {
                val acceptAll = object : X509TrustManager {
                    override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
                    override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
                    override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
                }
                val context = SSLContext.getInstance("TLS")
                context.init(null, arrayOf<TrustManager>(acceptAll), null)
                val socket = context.socketFactory.createSocket() as SSLSocket
                socket.use {
                    it.soTimeout = 6000
                    it.connect(InetSocketAddress(host, port.toInt()), 6000)
                    it.startHandshake()
                    val leaf = it.session.peerCertificates[0] as X509Certificate
                    promise.resolve(PinnedTls.fingerprintOf(leaf))
                }
            } catch (e: Exception) {
                promise.reject("E_PROBE", e.message ?: "Sem resposta do servidor.", e)
            }
        }.start()
    }

    @ReactMethod
    fun secureSet(name: String, value: String, promise: Promise) {
        try {
            SecureStore.put(reactContext, name, value)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("E_SECURE", e.message, e)
        }
    }

    @ReactMethod
    fun secureGet(name: String, promise: Promise) {
        try {
            promise.resolve(SecureStore.get(reactContext, name))
        } catch (e: Exception) {
            promise.reject("E_SECURE", e.message, e)
        }
    }

    @ReactMethod
    fun secureRemove(name: String, promise: Promise) {
        try {
            SecureStore.remove(reactContext, name)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("E_SECURE", e.message, e)
        }
    }

    /**
     * Abre o leitor de QR code do Google Play Services (a leitura é no aparelho e não pede permissão de
     * câmera). Sem o Play Services o leitor falha e o app oferece o pareamento digitado.
     */
    @ReactMethod
    fun scanQrCode(promise: Promise) {
        try {
            val options = GmsBarcodeScannerOptions.Builder()
                .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                .build()
            val scanner = GmsBarcodeScanning.getClient(reactContext.currentActivity ?: reactContext, options)
            scanner.startScan()
                .addOnSuccessListener { barcode -> promise.resolve(barcode.rawValue) }
                .addOnCanceledListener { promise.reject("E_CANCELED", "Leitura cancelada.") }
                .addOnFailureListener { e -> promise.reject("E_SCAN", e.message ?: "O leitor de QR code não está disponível.", e) }
        } catch (e: Exception) {
            promise.reject("E_SCAN", e.message ?: "O leitor de QR code não está disponível.", e)
        }
    }

    companion object {
        const val NAME = "QythonSecurity"
    }
}
