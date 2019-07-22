const Promise = require('bluebird');
// const fs = Promise.promisifyAll(require('fs'));
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const sharp = require('sharp');
const PptxGenJs = require('pptxgenjs');

const MAX_IMAGE_WIDTH_PX = 958;
const MAX_IMAGE_HEIGHT_PX = 540;
const DATE_TIME_FORMAT = 'YYYY-MM-DD_HH-mm-ss';

/**
 * Write the movie names to a file in the order they are in the array
 * @param {string[]} names array of movie names in order
 * @returns {string} the filename that was saved
 */
function writeSlideCallSheet(names) {
  try {
    const fileStamp = moment().format(DATE_TIME_FORMAT);
    const filename = `slide-list-${fileStamp}.txt`;
    fs.writeFileSync(filename, names.map((n, i) => `${i + 1}. ${n}`).join("\n"));
    return filename;
  } catch (ex) {
    console.error('Error writing call sheet: ', ex);
  }
}

/**
 * Wraps the Sharp.metadata call in a promise so I can await it
 * @param {Sharp} img a sharp instance created from an image
 * @returns {Promise}
 */
async function imageMeta(img) {
  return new Promise((resolve, reject) => {
    img.metadata((error, metadata) => {
      if (error) {
        return reject(error);
      }
      resolve(metadata);
    });
  });
}


/**
 * Write a pptx as a slideshow
 * @param {string[]} slides array of paths to slides
 * @returns {string} name of the powerpoint file written
 */
function writePptx(slides) {
  // create a pptx
  const fileStamp = moment().format(DATE_TIME_FORMAT);
  const pptx = new PptxGenJs();
  const slideDim = { w: 13.3, h: 7.5 };
  pptx.setLayout('LAYOUT_WIDE');// 13.33 x 7.5 inches | 957.6 x 540 px (72dpi)
  pptx.defineSlideMaster({
    title: 'MAIN',
    bkgd: '000000'
  });

  const allSlidePromises = [];

  slides.forEach(async (slidePath, idx) => {
    // todo: nothing is getting added to to the slideshow.
    const slide = pptx.addNewSlide('MAIN');
    const image = sharp(slidePath);
    let imgData;
    try {
      imgData = await imageMeta(image);
    } catch (ex) {
      console.error(err);
      process.exit(1);
    }

    // NOTE: we need to include the original width and height for the aspect ratio to be maintained
    slide.addImage({
      path: path.join('.', slidePath),
      x: 0,
      y: 0,
      w: imgData.width / 72,
      h: imgData.height / 72,
      sizing: {
        type: 'contain',
        w: MAX_IMAGE_WIDTH_PX / 72,
        h: MAX_IMAGE_HEIGHT_PX / 72
      }
    });

    slide.addText(`${idx + 1}`, {
      x: slideDim.w - .50,
      y: slideDim.h - .50,
      w: .25,
      h: .25,
      autofit: false,
      align: 'center',
      valign: 'middle',
      fontFace: 'Arial',
      fontSize: 20,
      color: 'ffffff',
      fill: '000000',
      isTextBox: true
    });
  });

  const filename = `NtF-${fileStamp}.pptx`;
  pptx.save(filename, () => {});
  return filename;
}


module.exports = {
  writeSlideCallSheet,
  writePptx
}
