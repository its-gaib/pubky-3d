import * as THREE from 'three';

export const WORLD_ANIME_SHIRTS = {
  count: 20,
  nearbyDistance: 4,
  fabric: '#14131F',
} as const;

/** Original manga print, painted once and shared by every shirt. No external images or fonts. */
export function createWorldAnimeShirtTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 640;
  const context = canvas.getContext('2d');
  if (context) {
    const ink = '#121020';
    const ivory = '#FFF4E4';
    const cyan = '#5AF9F1';
    const pink = '#FF497F';
    const polygon = (points: readonly (readonly [number, number])[], color: string, outline = ink, width = 6) => {
      context.beginPath();
      context.moveTo(...points[0]);
      for (const point of points.slice(1)) context.lineTo(...point);
      context.closePath();
      context.fillStyle = color;
      context.fill();
      if (width > 0) {
        context.strokeStyle = outline;
        context.lineWidth = width;
        context.lineJoin = 'round';
        context.stroke();
      }
    };
    const line = (points: readonly (readonly [number, number])[], color: string, width: number) => {
      context.beginPath();
      context.moveTo(...points[0]);
      for (const point of points.slice(1)) context.lineTo(...point);
      context.strokeStyle = color;
      context.lineWidth = width;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.stroke();
    };

    context.fillStyle = WORLD_ANIME_SHIRTS.fabric;
    context.fillRect(0, 0, 512, 640);
    const aura = context.createRadialGradient(249, 269, 20, 256, 310, 300);
    aura.addColorStop(0, '#50616D');
    aura.addColorStop(0.55, '#252B47');
    aura.addColorStop(1, WORLD_ANIME_SHIRTS.fabric);
    context.fillStyle = aura;
    context.fillRect(10, 66, 492, 514);

    // A broken cyan halo, screen tones and sharp speed lines frame the silhouette.
    context.strokeStyle = cyan;
    context.lineWidth = 13;
    context.beginPath();
    context.arc(258, 281, 176, -Math.PI * 0.96, Math.PI * 0.55);
    context.stroke();
    context.strokeStyle = pink;
    context.lineWidth = 5;
    context.beginPath();
    context.arc(258, 281, 191, -Math.PI * 0.38, Math.PI * 0.82);
    context.stroke();
    for (let row = 0; row < 28; row++) {
      for (let column = 0; column < 22; column++) {
        const x = 30 + column * 21 + (row % 2) * 9;
        const y = 89 + row * 17;
        if (Math.hypot(x - 255, y - 280) < 138) continue;
        context.fillStyle = (column + row) % 3 ? '#364252' : '#547C84';
        context.beginPath();
        context.arc(x, y, 1.4 + ((row + column) % 3) * 0.5, 0, Math.PI * 2);
        context.fill();
      }
    }
    for (let index = 0; index < 23; index++) {
      const angle = (index / 23) * Math.PI * 2;
      const inner = 200 + (index % 4) * 8;
      line(
        [
          [256 + Math.cos(angle) * inner, 291 + Math.sin(angle) * inner],
          [256 + Math.cos(angle) * 330, 291 + Math.sin(angle) * 330],
        ],
        index % 4 ? '#46526A' : ivory,
        index % 4 ? 2 : 4,
      );
    }
    polygon(
      [
        [26, 441],
        [89, 299],
        [69, 372],
        [126, 330],
        [71, 473],
        [91, 402],
      ],
      cyan,
      cyan,
      0,
    );
    polygon(
      [
        [407, 167],
        [467, 78],
        [447, 159],
        [484, 137],
        [423, 264],
        [440, 183],
      ],
      pink,
      pink,
      0,
    );

    // Katana, flowing scarf and angular jacket establish an original storm ronin.
    polygon(
      [
        [104, 511],
        [373, 163],
        [402, 128],
        [391, 176],
        [129, 527],
      ],
      '#A9BECC',
    );
    line(
      [
        [123, 507],
        [384, 168],
      ],
      ivory,
      5,
    );
    polygon(
      [
        [71, 454],
        [218, 399],
        [372, 382],
        [454, 429],
        [381, 416],
        [466, 483],
        [326, 432],
      ],
      pink,
    );
    polygon(
      [
        [60, 524],
        [119, 434],
        [204, 399],
        [260, 413],
        [328, 399],
        [411, 447],
        [461, 547],
      ],
      '#242944',
    );
    polygon(
      [
        [97, 509],
        [140, 449],
        [204, 423],
        [193, 482],
        [224, 548],
      ],
      '#455069',
    );
    polygon(
      [
        [300, 415],
        [385, 454],
        [441, 538],
        [359, 509],
        [320, 557],
      ],
      '#17172C',
    );
    line(
      [
        [127, 480],
        [179, 447],
        [172, 486],
        [196, 528],
      ],
      cyan,
      7,
    );
    line(
      [
        [337, 440],
        [393, 484],
        [349, 469],
      ],
      pink,
      5,
    );
    polygon(
      [
        [213, 358],
        [301, 352],
        [315, 420],
        [269, 451],
        [204, 409],
      ],
      '#EAB7A5',
    );
    polygon(
      [
        [219, 366],
        [302, 352],
        [301, 399],
        [270, 421],
        [234, 407],
      ],
      '#AB6981',
      ink,
      0,
    );

    // Three-quarter face: warm planes, sharply inked eyes, scar and silver spikes.
    polygon(
      [
        [177, 225],
        [310, 191],
        [355, 251],
        [338, 335],
        [294, 382],
        [257, 403],
        [204, 366],
        [172, 309],
      ],
      '#F5C8AA',
    );
    polygon(
      [
        [299, 219],
        [349, 254],
        [331, 337],
        [292, 380],
        [255, 398],
        [271, 350],
        [301, 317],
      ],
      '#C78386',
      ink,
      0,
    );
    polygon(
      [
        [176, 274],
        [159, 273],
        [157, 306],
        [182, 327],
        [190, 301],
      ],
      '#E9A78E',
    );
    line(
      [
        [166, 286],
        [179, 294],
        [171, 306],
      ],
      '#9C576E',
      4,
    );
    polygon(
      [
        [183, 281],
        [202, 273],
        [245, 285],
        [226, 308],
        [198, 302],
      ],
      ivory,
      ink,
      5,
    );
    polygon(
      [
        [269, 281],
        [295, 263],
        [330, 261],
        [317, 288],
        [287, 293],
      ],
      ivory,
      ink,
      5,
    );
    polygon(
      [
        [211, 282],
        [226, 286],
        [225, 301],
        [214, 302],
      ],
      cyan,
      ink,
      3,
    );
    polygon(
      [
        [296, 270],
        [310, 265],
        [308, 286],
        [297, 289],
      ],
      cyan,
      ink,
      3,
    );
    line(
      [
        [218, 286],
        [218, 297],
      ],
      ink,
      4,
    );
    line(
      [
        [303, 272],
        [302, 283],
      ],
      ink,
      4,
    );
    line(
      [
        [190, 264],
        [212, 263],
        [245, 278],
      ],
      ink,
      9,
    );
    line(
      [
        [268, 275],
        [295, 249],
        [330, 249],
      ],
      ink,
      9,
    );
    line(
      [
        [259, 283],
        [252, 322],
        [267, 327],
      ],
      '#8B556B',
      4,
    );
    line(
      [
        [239, 350],
        [279, 345],
        [292, 339],
      ],
      ink,
      5,
    );
    line(
      [
        [253, 359],
        [273, 357],
      ],
      '#9C576E',
      3,
    );
    line(
      [
        [318, 299],
        [309, 323],
        [304, 341],
      ],
      ivory,
      4,
    );
    for (let index = 0; index < 4; index++) {
      line(
        [
          [200 + index * 8, 319],
          [195 + index * 8, 330],
        ],
        '#B9757C',
        2,
      );
      line(
        [
          [302 + index * 5, 343],
          [298 + index * 5, 351],
        ],
        '#75465B',
        2,
      );
    }
    polygon(
      [
        [162, 273],
        [122, 233],
        [162, 238],
        [124, 188],
        [169, 200],
        [154, 139],
        [198, 168],
        [200, 112],
        [232, 150],
        [258, 94],
        [274, 143],
        [321, 114],
        [314, 161],
        [365, 145],
        [344, 185],
        [384, 191],
        [353, 219],
        [374, 256],
        [331, 241],
        [311, 204],
        [283, 254],
        [274, 212],
        [236, 264],
        [243, 209],
        [204, 249],
        [204, 220],
        [181, 279],
      ],
      '#E7EEF1',
      ink,
      8,
    );
    polygon(
      [
        [159, 191],
        [191, 211],
        [180, 250],
        [202, 216],
        [198, 181],
      ],
      '#98AABE',
      ink,
      0,
    );
    polygon(
      [
        [211, 157],
        [232, 184],
        [224, 230],
        [251, 184],
        [263, 122],
        [243, 160],
      ],
      ivory,
      ink,
      0,
    );
    polygon(
      [
        [315, 166],
        [281, 211],
        [285, 237],
        [315, 203],
        [341, 231],
      ],
      '#9DACBF',
      ink,
      0,
    );
    line(
      [
        [278, 150],
        [263, 190],
        [252, 210],
      ],
      '#7788A5',
      4,
    );
    line(
      [
        [206, 176],
        [219, 204],
      ],
      '#7788A5',
      3,
    );
    line(
      [
        [324, 166],
        [300, 190],
      ],
      ivory,
      6,
    );
    polygon(
      [
        [167, 312],
        [205, 355],
        [256, 389],
        [217, 411],
        [155, 365],
      ],
      '#242944',
    );
    line(
      [
        [170, 333],
        [216, 385],
      ],
      cyan,
      5,
    );

    // Foreground energy fragments, restrained type and print-registration marks.
    line(
      [
        [35, 546],
        [78, 490],
        [55, 501],
        [100, 423],
      ],
      cyan,
      9,
    );
    line(
      [
        [385, 543],
        [453, 446],
        [422, 463],
        [476, 372],
      ],
      pink,
      7,
    );
    for (const [x, y, size] of [
      [84, 192, 13],
      [410, 300, 16],
      [109, 350, 8],
      [377, 100, 9],
    ]) {
      polygon(
        [
          [x, y - size],
          [x + 3, y - 3],
          [x + size, y],
          [x + 3, y + 3],
          [x, y + size],
          [x - 3, y + 3],
          [x - size, y],
          [x - 3, y - 3],
        ],
        ivory,
        ivory,
        0,
      );
    }
    context.fillStyle = WORLD_ANIME_SHIRTS.fabric;
    context.fillRect(0, 0, 512, 66);
    context.fillRect(0, 551, 512, 89);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = cyan;
    context.font = 'bold 24px monospace';
    context.fillText('S T O R M   / /   0 1', 256, 39);
    context.fillStyle = ivory;
    context.font = '900 55px sans-serif';
    context.fillText('NIGHT RONIN', 256, 582, 459);
    context.font = 'bold 15px monospace';
    context.fillStyle = pink;
    context.fillText('UNBROKEN  /  UNBOUND', 256, 622);
    line(
      [
        [24, 16],
        [24, 53],
        [51, 53],
      ],
      ivory,
      2,
    );
    line(
      [
        [488, 16],
        [488, 53],
        [461, 53],
      ],
      ivory,
      2,
    );
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'original-night-ronin-shirt';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
