package ai.qython.app

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.modules.network.CustomClientBuilder
import com.facebook.react.modules.network.NetworkingModule
import com.facebook.react.modules.network.OkHttpClientFactory
import com.facebook.react.modules.network.OkHttpClientProvider
import com.facebook.react.modules.websocket.WebSocketModule

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
          add(QythonSecurityPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    // O celular fala com o Qython do computador por HTTPS com certificado autoassinado, aceito só
    // pela impressão digital do pareamento (PinnedTls). Isto precisa valer antes da primeira
    // requisição: as impressões digitais vêm de um arquivo, não do JavaScript.
    PinnedTls.load(this)
    OkHttpClientProvider.setOkHttpClientFactory(
      OkHttpClientFactory { PinnedTls.configure(OkHttpClientProvider.createClientBuilder(applicationContext)).build() },
    )
    val pinned = CustomClientBuilder { builder -> PinnedTls.configure(builder) }
    NetworkingModule.setCustomClientBuilder(pinned)
    WebSocketModule.setCustomClientBuilder(pinned)
    loadReactNative(this)
  }
}
