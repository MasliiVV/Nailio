interface BrandLogoProps {
  variant?: 'mark' | 'wordmark';
  className?: string;
  alt?: string;
}

export function BrandLogo({
  variant = 'wordmark',
  className,
  alt = 'Nailio',
}: BrandLogoProps) {
  const src = variant === 'mark' ? '/brand/logo-mark.svg' : '/brand/logo-wordmark.svg';

  return <img src={src} alt={alt} className={className} />;
}
