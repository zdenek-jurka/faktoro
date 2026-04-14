export function splitFileName(fileName: string) {
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex <= 0) {
    return { baseName: fileName, extension: '' };
  }

  return {
    baseName: fileName.slice(0, dotIndex),
    extension: fileName.slice(dotIndex),
  };
}

export function buildCopyFileName(fileName: string, existingNames: Set<string>): string {
  const { baseName, extension } = splitFileName(fileName);
  let copyIndex = 2;
  let nextName = `${baseName} (${copyIndex})${extension}`;

  while (existingNames.has(nextName)) {
    copyIndex += 1;
    nextName = `${baseName} (${copyIndex})${extension}`;
  }

  return nextName;
}
