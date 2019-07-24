const Promise = require('bluebird');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const sharp = require('sharp');
const PptxGenJs = require('pptxgenjs');
const cconsole = require('./color-console');

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
 * Wraps the PptxGenJs save function in a promise so I can await it
 * @param {PptxGenJs} pptx a powerpoint object
 * @param {string} filename
 * @returns {Promise<string>} resolves with filename when save is hopefully complete
 */
async function savePptx(pptx, filename) {
  return new Promise((resolve) => {
    pptx.save(filename, (fname) => {
      resolve(fname);
    })
  })
}

/**
 * Write a pptx as a slideshow
 * @param {string[]} slides array of paths to slides
 * @returns {string} name of the powerpoint file written
 */
async function writePptx(slides) {
  // create a pptx
  const fileStamp = moment().format(DATE_TIME_FORMAT);
  const pptx = new PptxGenJs();
  const slideDim = { w: 13.3, h: 7.5 };
  pptx.setLayout('LAYOUT_WIDE');// 13.33 x 7.5 inches | 957.6 x 540 px (72dpi)
  pptx.defineSlideMaster({
    title: 'MAIN',
    bkgd: '000000'
  });

  // we queue all the image metadata calls because they can complete out of order. So we wait for all to maintain the order in the pptx
  const slidePromises = [];
  slides.forEach((slidePath) => {
    const image = sharp(path.join('.', slidePath));
    slidePromises.push(image.metadata());
  });
  return await Promise.all(slidePromises)
    .then((allData) => {
      allData.forEach((imgData, idx) => {
        const slide = pptx.addNewSlide('MAIN');

        // NOTE: we need to include the original width and height for the aspect ratio to be maintained
        slide.addImage({
          path: path.join('.', slides[ idx ]),
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
          x: slideDim.w - .75,
          y: slideDim.h - .75,
          w: .5,
          h: .5,
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
    })
    .catch((err) => {
      cconsole.error(err);
      process.exit(1);
    })
    .then(() => {
      return savePptx(pptx, `NtF-${fileStamp}.pptx`);
    });
}


module.exports = {
  writeSlideCallSheet,
  writePptx
}
