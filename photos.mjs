function bundledPhoto(slug, name, width, height, alt, id = slug) {
  return {
    id, name, alt, width, height,
    source: './assets/photos/' + slug + '.webp',
    thumbnail: './assets/photos/thumbs/' + slug + '.webp',
  }
}

export const starterPhotos = [
  // The original four IDs are used in saved puzzles.
  bundledPhoto('garden-patrol', 'Garden patrol', 1680, 1260,
    'Black-and-white cat in a garden with pink flowers', 'garden'),
  bundledPhoto('blue-blanket', 'Blue blanket', 720, 540,
    'Black-and-white cat resting on a bright blue blanket', 'blue'),
  bundledPhoto('afternoon-nap', 'Afternoon nap', 1680, 1260,
    'Fluffy cat curled up asleep on a blue cushion', 'nap'),
  bundledPhoto('armchair-lounge', 'The armchair', 1680, 952,
    'Black-and-white cat lounging across a dark chair', 'armchair'),
  bundledPhoto('shopping-bag-lookout', 'Shopping bag lookout', 945, 1680,
    'Black-and-white cat sitting among shopping bags'),
  bundledPhoto('duvet-den', 'Duvet den', 1680, 1260,
    'Cat nestled in a rumpled blue duvet'),
  bundledPhoto('snow-at-sundown', 'Snow at sundown', 1680, 945,
    'Snow-covered slopes and scattered trees in pink evening light'),
  bundledPhoto('sunlit-meadow', 'Sunlit meadow', 1680, 1265,
    'Sunlight breaking over a mountain ridge and a meadow of yellow flowers'),
  bundledPhoto('mountain-afterglow', 'Mountain afterglow', 1680, 1265,
    'Pink and orange sky over a dark mountain ridge and a wildflower meadow'),
  bundledPhoto('valley-launch', 'Valley launch', 1680, 1265,
    'Red hang glider at a clearing overlooking a mountain valley'),
  bundledPhoto('red-wing', 'Red wing', 1260, 1680,
    'Person holding a red hang glider on a grassy slope'),
  bundledPhoto('rockside-frog', 'Rockside frog', 1680, 1260,
    'Golden brown frog perched on a gray rock'),
  bundledPhoto('above-the-clouds', 'Above the clouds', 1680, 945,
    'Wooden launch ramp above a valley filled with clouds'),
]
