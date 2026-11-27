type AndroidDocumentReader = {
  begin(uri: string): string;
  read(id: string): Promise<Uint8Array>;
  close(id: string): void;
};

export function openAndroidDocument(reader: AndroidDocumentReader, uri: string) {
  const id = reader.begin(uri);
  let closed = false;
  const close = () => {
    if (!closed) {
      closed = true;
      reader.close(id);
    }
  };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read(id);
        if (closed) return;
        if (chunk.length) controller.enqueue(chunk);
        else {
          close();
          controller.close();
        }
      } catch (error) {
        if (closed) return;
        close();
        controller.error(error);
      }
    },
    cancel: close,
  }, { highWaterMark: 0 });
}

export type { AndroidDocumentReader };
