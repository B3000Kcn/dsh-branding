/** Uploaded images stay in the settings document, without external asset routes. */
export const MAX_FILE_BYTES = 512 * 1024
export const MAX_DATA_URL_LENGTH = Math.ceil(MAX_FILE_BYTES / 3) * 4 + 80
export const IMAGE_PATTERN = /^(?:|data:image\/(?:png|jpeg|webp|gif|svg\+xml|x-icon|vnd\.microsoft\.icon);base64,[A-Za-z0-9+/]+={0,2})$/
export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,.ico'

/** Check persisted image data before assigning it to an image or favicon URL. */
export function isImageData(value) {
  return typeof value === 'string' && value.length <= MAX_DATA_URL_LENGTH && IMAGE_PATTERN.test(value)
}

/** Read and decode an upload without inserting its contents as HTML or SVG markup. */
export async function readImage(file, env = globalThis) {
  if (!file || file.size <= 0 || file.size > MAX_FILE_BYTES) throw new Error('请选择不超过 512 KiB 的图片。')
  let type = file.type.toLowerCase()
  if (!type && /\.ico$/i.test(file.name)) type = 'image/x-icon'
  if (!/^image\/(?:png|jpeg|webp|gif|svg\+xml|x-icon|vnd\.microsoft\.icon)$/.test(type)) {
    throw new Error('支持 PNG、JPEG、WebP、GIF、SVG 和 ICO。')
  }
  const data = await new Promise((resolve, reject) => {
    const reader = new env.FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('读取图片失败。'))
    reader.onabort = () => reject(new Error('读取图片已取消。'))
    reader.readAsDataURL(file)
  })
  // Some browsers omit the MIME type of ICO files in FileReader output.
  const url = typeof data === 'string' ? data.replace(/^data:[^;,]*;base64,/, `data:${type};base64,`) : ''
  if (!isImageData(url) || !url) throw new Error('图片数据无效或过大。')
  await new Promise((resolve, reject) => {
    const picture = new env.Image()
    picture.onload = () => {
      const width = picture.naturalWidth
      const height = picture.naturalHeight
      if (width <= 0 || height <= 0 || width > 16384 || height > 16384 || width * height > 32 * 1024 * 1024) {
        reject(new Error('图片尺寸无效或过大，请缩小后重试。'))
      } else resolve()
    }
    picture.onerror = () => reject(new Error('图片无法解码，请更换文件。'))
    picture.src = url
  })
  return url
}
