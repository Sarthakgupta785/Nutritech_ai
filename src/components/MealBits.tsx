import { usePhotoUrl } from '../lib/hooks'
import { Icon, cx } from './ui'

export function MealThumb({ mealId, hasPhoto, className }: { mealId: string; hasPhoto: boolean; className?: string }) {
  const url = usePhotoUrl(mealId, hasPhoto)
  return (
    <div className={cx('flex shrink-0 items-center justify-center overflow-hidden bg-ink-100 text-ink-300', className)}>
      {url ? <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" /> : <Icon name={hasPhoto ? 'image' : 'log'} size={24} />}
    </div>
  )
}
