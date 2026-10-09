const maxImageDimension = 1600
const webpQuality = 0.82

function loadImage(file: File): Promise<{ image: HTMLImageElement; objectUrl: string }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => resolve({ image, objectUrl })
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error(`Could not read image "${file.name}".`))
    }
    image.src = objectUrl
  })
}

function canvasToWebp(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('The selected image could not be optimized by this browser.'))
    }, 'image/webp', webpQuality)
  })
}

export async function optimizeListingImage(file: File): Promise<File> {
  // Keep GIF animations intact.
  if (file.type === 'image/gif') return file

  const { image, objectUrl } = await loadImage(file)
  try {
    const scale = Math.min(1, maxImageDimension / Math.max(image.naturalWidth, image.naturalHeight))
    const width = Math.max(1, Math.round(image.naturalWidth * scale))
    const height = Math.max(1, Math.round(image.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (!context) throw new Error('This browser cannot optimize the selected image.')
    context.drawImage(image, 0, 0, width, height)

    const webp = await canvasToWebp(canvas)
    if (webp.type !== 'image/webp' || webp.size >= file.size) return file

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'listing-image'
    return new File([webp], `${baseName}.webp`, { type: 'image/webp', lastModified: file.lastModified })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
