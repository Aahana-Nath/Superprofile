export interface ResizeOpts {
  w: number
  h: number
  crop: boolean // centre-crop to a square
}

export const IMAGE_SIZES = {
  cover: { w: 1200, h: 600, crop: false },
  avatar: { w: 400, h: 400, crop: true },
  product: { w: 700, h: 700, crop: true },
} satisfies Record<string, ResizeOpts>

/** Downscale (and optionally centre-crop) an uploaded image in the browser. Returns a JPEG data URL. */
export function resizeImage(file: File, opts: ResizeOpts): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let sx = 0, sy = 0, sw = img.width, sh = img.height
      if (opts.crop) {
        const side = Math.min(img.width, img.height)
        sx = (img.width - side) / 2
        sy = (img.height - side) / 2
        sw = sh = side
      }
      const scale = Math.min(1, opts.w / sw, opts.crop ? opts.h / sh : Infinity)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(sw * scale)
      canvas.height = Math.round(sh * scale)
      canvas.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(img.src)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}
