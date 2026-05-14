import React from 'react';
import type { ImageProps } from 'next/image';

const Image = ({ src, alt, fill: _fill, sizes: _sizes, ...props }: ImageProps) =>
  // eslint-disable-next-line @next/next/no-img-element
  <img src={String(src)} alt={alt ?? ''} {...props} />;

export default Image;
