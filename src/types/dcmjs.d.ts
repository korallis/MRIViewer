declare module 'dcmjs' {
  const dcmjs: {
    data: {
      DicomDict: new (meta: Record<string, unknown>) => {
        dict: Record<string, unknown>;
        write(options?: Record<string, unknown>): ArrayBuffer;
      };
      DicomMessage: {
        readFile(buffer: ArrayBuffer, options?: Record<string, unknown>): {
          dict: Record<string, unknown>;
          meta: Record<string, unknown>;
        };
      };
      DicomMetaDictionary: {
        naturalizeDataset(dict: Record<string, unknown>): any;
        denaturalizeDataset(dataset: Record<string, unknown>): Record<string, unknown>;
        uid(): string;
      };
    };
  };
  export default dcmjs;
}
