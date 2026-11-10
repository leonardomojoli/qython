package ai.qython.app

import android.content.Context
import java.net.Socket
import java.security.KeyStore
import java.security.MessageDigest
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import java.util.concurrent.ConcurrentHashMap
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLEngine
import javax.net.ssl.SSLSocket
import javax.net.ssl.TrustManager
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509ExtendedTrustManager
import javax.net.ssl.X509TrustManager
import okhttp3.OkHttpClient

/**
 * Confiança TLS do celular pareado (docs/PAREAMENTO.md).
 *
 * O Qython do computador fala HTTPS com um certificado autoassinado, que nenhuma autoridade
 * reconhece. Quem garante que é mesmo o computador do médico é a impressão digital (SHA-256 do
 * certificado) lida no QR code: para cada servidor pareado guardamos "host:porta" -> impressão
 * digital, e a conexão com esse servidor só é aceita se o certificado for EXATAMENTE aquele, mesmo
 * que outra autoridade assine um certificado válido para o mesmo endereço. Qualquer outro endereço
 * segue a validação normal do sistema.
 *
 * As impressões digitais ficam num arquivo de preferências do app e são lidas em
 * [MainApplication.onCreate], antes da primeira requisição, sem depender do JavaScript estar de pé.
 */
object PinnedTls {
    private const val PREFS = "qython_tls_pins"

    private val pins = ConcurrentHashMap<String, String>()

    fun load(context: Context) {
        val stored = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).all
        pins.clear()
        for ((key, value) in stored) {
            if (value is String) pins[key] = value
        }
    }

    fun set(context: Context, hostPort: String, fingerprint: String) {
        val key = hostPort.lowercase()
        val value = fingerprint.lowercase()
        pins[key] = value
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(key, value).commit()
    }

    fun remove(context: Context, hostPort: String) {
        val key = hostPort.lowercase()
        pins.remove(key)
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(key).commit()
    }

    fun clear(context: Context) {
        pins.clear()
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().commit()
    }

    /** SHA-256 do certificado em DER, em hexadecimal minúsculo (a mesma que o computador mostra). */
    fun fingerprintOf(cert: X509Certificate): String =
        MessageDigest.getInstance("SHA-256").digest(cert.encoded).joinToString("") { "%02x".format(it) }

    private fun keyOf(host: String?, port: Int): String? = host?.lowercase()?.let { "$it:$port" }

    private val systemTrust: X509TrustManager by lazy {
        val factory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
        factory.init(null as KeyStore?)
        factory.trustManagers.first { it is X509TrustManager } as X509TrustManager
    }

    private val defaultVerifier: HostnameVerifier by lazy { OkHttpClient().hostnameVerifier }

    private fun matches(chain: Array<out X509Certificate>?, pin: String) {
        val leaf = chain?.firstOrNull() ?: throw CertificateException("O servidor não enviou certificado.")
        val got = fingerprintOf(leaf)
        if (!MessageDigest.isEqual(got.toByteArray(), pin.toByteArray())) {
            throw CertificateException("O certificado do servidor não é o do computador pareado.")
        }
    }

    private fun pinFor(socket: Socket?): String? {
        if (socket == null) return null
        val session = try {
            (socket as? SSLSocket)?.handshakeSession
        } catch (e: Exception) {
            null
        }
        val candidates = listOf(
            keyOf(session?.peerHost, session?.peerPort ?: socket.port),
            keyOf(socket.inetAddress?.hostAddress, socket.port),
        )
        return candidates.firstNotNullOfOrNull { key -> key?.let { pins[it] } }
    }

    private fun pinFor(engine: SSLEngine?): String? {
        val session = try {
            engine?.handshakeSession
        } catch (e: Exception) {
            null
        }
        return keyOf(session?.peerHost, session?.peerPort ?: -1)?.let { pins[it] }
    }

    /** Com impressão digital registrada para o servidor da conexão, só ela vale; sem, vale o sistema. */
    private class PinningTrustManager : X509ExtendedTrustManager() {
        override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?, socket: Socket?) {
            val pin = pinFor(socket)
            when {
                pin != null -> matches(chain, pin)
                systemTrust is X509ExtendedTrustManager ->
                    (systemTrust as X509ExtendedTrustManager).checkServerTrusted(chain, authType, socket)
                else -> systemTrust.checkServerTrusted(chain, authType)
            }
        }

        override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?, engine: SSLEngine?) {
            val pin = pinFor(engine)
            when {
                pin != null -> matches(chain, pin)
                systemTrust is X509ExtendedTrustManager ->
                    (systemTrust as X509ExtendedTrustManager).checkServerTrusted(chain, authType, engine)
                else -> systemTrust.checkServerTrusted(chain, authType)
            }
        }

        override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {
            systemTrust.checkServerTrusted(chain, authType)
        }

        // O app nunca se autentica com certificado de cliente.
        override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?, socket: Socket?) {
            throw CertificateException("Autenticação de cliente não é usada.")
        }

        override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?, engine: SSLEngine?) {
            throw CertificateException("Autenticação de cliente não é usada.")
        }

        override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {
            throw CertificateException("Autenticação de cliente não é usada.")
        }

        override fun getAcceptedIssuers(): Array<X509Certificate> = systemTrust.acceptedIssuers
    }

    private val trustManager by lazy { PinningTrustManager() }

    private val sslContext: SSLContext by lazy {
        SSLContext.getInstance("TLS").also { it.init(null, arrayOf<TrustManager>(trustManager), null) }
    }

    /**
     * No servidor pareado o certificado autoassinado não bate com o nome do endereço (é um IP da rede),
     * então a verificação de nome é trocada pela conferência da impressão digital, que é mais forte.
     */
    private val verifier = HostnameVerifier { hostname, session ->
        val pin = keyOf(hostname, session.peerPort)?.let { pins[it] }
        if (pin != null) {
            try {
                fingerprintOf(session.peerCertificates[0] as X509Certificate) == pin
            } catch (e: Exception) {
                false
            }
        } else {
            defaultVerifier.verify(hostname, session)
        }
    }

    /** Aplica a confiança acima a um cliente OkHttp (usado pelo cliente do React Native). */
    fun configure(builder: OkHttpClient.Builder): OkHttpClient.Builder =
        builder.sslSocketFactory(sslContext.socketFactory, trustManager).hostnameVerifier(verifier)
}
