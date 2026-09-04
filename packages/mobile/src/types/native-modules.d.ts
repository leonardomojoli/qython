// Type declarations for native modules that may not have bundled types

declare module '@react-native-voice/voice' {
  interface SpeechResultsEvent {
    value?: string[];
  }
  interface SpeechErrorEvent {
    error?: { code?: string; message?: string };
  }
  const Voice: {
    onSpeechResults: ((e: SpeechResultsEvent) => void) | null;
    onSpeechPartialResults: ((e: SpeechResultsEvent) => void) | null;
    onSpeechError: ((e: SpeechErrorEvent) => void) | null;
    start(locale?: string): Promise<void>;
    stop(): Promise<void>;
    destroy(): Promise<void>;
    removeAllListeners(): void;
    isAvailable(): Promise<boolean>;
  };
  export default Voice;
}

declare module 'react-native-keep-awake' {
  const KeepAwake: {
    activate(): void;
    deactivate(): void;
  };
  export default KeepAwake;
}

declare module 'react-native-share' {
  interface ShareOptions {
    url?: string;
    message?: string;
    type?: string;
    filename?: string;
    title?: string;
  }
  const RNShare: {
    open(options: ShareOptions): Promise<void>;
  };
  export default RNShare;
}

declare module 'react-native-blob-util' {
  interface FetchBlobResponse {
    path(): string;
    data: string;
  }
  interface StaticFetchBlob {
    config(options: {
      fileCache?: boolean;
      appendExt?: string;
      path?: string;
    }): {
      fetch(
        method: string,
        url: string,
        headers?: Record<string, string>,
      ): Promise<FetchBlobResponse>;
    };
    fs: {
      unlink(path: string): Promise<void>;
    };
  }
  const ReactNativeBlobUtil: StaticFetchBlob;
  export default ReactNativeBlobUtil;
}
