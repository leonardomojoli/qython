// Type declarations for native modules that may not have bundled types

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
