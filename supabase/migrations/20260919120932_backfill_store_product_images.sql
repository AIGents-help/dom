-- Give the Admin Store catalog recognizable thumbnails using existing public assets.
update public.shop_inventory
set image_url = case product_key
  when 'barrier-1' then '/shop/barriers/dom-single-barrier.webp'
  when 'barrier-3' then '/shop/barriers/dom-3-post-field-kit.webp'
  when 'barrier-4' then '/shop/barriers/dom-4-post-large-drone-zone.webp'
  when 'barrier-6' then '/shop/drone-barrier-hero.svg'
  when 'barrier-12' then '/shop/barriers/dom-12-post-jobsite-kit.webp'
  when 'barrier-24' then '/shop/barriers/dom-24-post-corporate-kit.webp'
  when 'drone-operation-safety-vest' then '/shop/safety/drone-operation-vest-front.jpeg'
  when 'portable-landing-pad' then '/shop/safety/portable-landing-pad.jpeg'
  else image_url
end,
updated_at = now()
where image_url is null
  and product_key in (
    'barrier-1', 'barrier-3', 'barrier-4', 'barrier-6', 'barrier-12', 'barrier-24',
    'drone-operation-safety-vest', 'portable-landing-pad'
  );
