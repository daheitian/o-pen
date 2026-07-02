const DEFAULT_UPLOAD_URL = 'http://localhost:5005/api/upload';

export function getClipboardImageFiles(clipboardData: DataTransfer): File[] {
  const files = Array.from(clipboardData.files).filter(file => file.type.startsWith('image/'));
  if (files.length > 0) return files;

  return Array.from(clipboardData.items)
    .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
    .map(item => item.getAsFile())
    .filter((file): file is File => Boolean(file));
}

export async function uploadImageFile(file: File, uploadUrl = DEFAULT_UPLOAD_URL): Promise<string> {
  const formData = new FormData();
  formData.append('image', file);

  const res = await fetch(uploadUrl, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    throw new Error('Image upload failed');
  }

  const data = await res.json() as { url: string };
  return data.url;
}
