const PDFDocument = require('pdfkit');
const { fyShuffle } = require('./common');

/**
 * A rectangle
 * @typedef {Object<string, number>} Rect
 * @property {number} x left side
 * @property {number} y top side
 * @property {number} w width
 * @property {number} h height
 */
/**
 * A position
 * @typedef {Object<string, number>} Pos
 * @property {number} x left side
 * @property {number} y top side
 */
/**
 * A size
 * @typedef {Object<string, number>} Size
 * @property {number} w width
 * @property {number} h height
 */

// various configuration values
const fontDir = 'assets/fonts/OpenSans'

const marginSize = 36; // 72dpi, so .5" margin
const spaceBetweenGrids = 18;
/** @type {Size} */
const cellSize = { w: 108, h: 58 }; // 108 x 58 points with a .25" (18pt) space between the two
/** @type {Pos} */
const origin = { x: marginSize, y: marginSize }; // origin is relative to edge of page, so starts margin
/** @type {Rect[]} */
const topGrid = [];
/** @type {Rect[]} */
const bottomGrid = [];

const cols = 5;
const rows = 6;
const boxHeight = rows * cellSize.h;
const boxWidth = cols * cellSize.w;
const bottomGridOffset = boxHeight + spaceBetweenGrids; // * subtracting out line width

const titleFillColor = "#ddd";
const strokeColor = '#555';
const textColor = '#333';

/**
 * Build the top and bottom grids of rectangles. We can do it just once and use them on every page.
 */
function calculateGrids() {
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      topGrid.push({
        x: origin.x + (col * cellSize.w),
        y: origin.y + (row * cellSize.h),
        w: cellSize.w,
        h: cellSize.h,
        fillColor: row === 0 ? titleFillColor : undefined,
      });
      bottomGrid.push({
        x: origin.x + (col * cellSize.w),
        y: origin.y + bottomGridOffset + (row * cellSize.h),
        w: cellSize.w,
        h: cellSize.h,
        fillColor: row === 0 ? titleFillColor : undefined,
      });
    }
  }
}

/**
 * Draw the cells for a bingo card, both top and bottom
 * @param {PDFDocument} doc
 * @returns {PDFDocument}
 */
function drawBoxes(doc) {
  // two sets of boxes, 5x6 - one row for title, 5 rows for play spots

  // set options
  doc.lineWidth(1);

  // draw top and bottom box
  doc.rect(origin.x, origin.y, boxWidth, boxHeight)
    .rect(origin.x, origin.y + bottomGridOffset, boxWidth, boxHeight)
    .stroke(strokeColor);

  // fill top and bottom title boxes
  doc.rect(origin.x, origin.y, boxWidth, cellSize.h)
    .rect(origin.x, origin.y + bottomGridOffset, boxWidth, cellSize.h)
    .fillAndStroke(titleFillColor, strokeColor);

  // draw vertical lines to define columns
  for (let col = 1; col < cols; col++) {
    doc.moveTo(origin.x + (col * cellSize.w), origin.y)
      .lineTo(origin.x + (col * cellSize.w), origin.y + boxHeight)
      .moveTo(origin.x + (col * cellSize.w), origin.y + bottomGridOffset)
      .lineTo(origin.x + (col * cellSize.w), origin.y + boxHeight + bottomGridOffset);
  }
  doc.stroke(strokeColor);

  // draw horizontal lines to define rows
  for (let row = 1; row < rows; row++) {
    doc.moveTo(origin.x, origin.y + (row * cellSize.h))
      .lineTo(origin.x + boxWidth, origin.y + (row * cellSize.h))
      .moveTo(origin.x, origin.y + (row * cellSize.h) + bottomGridOffset)
      .lineTo(origin.x + boxWidth, origin.y + (row * cellSize.h) + bottomGridOffset);
  }
  doc.stroke(strokeColor);

  return doc;
}

/**
 * Draw the title for each bingo card, both top and bottom
 * @param {PDFDocument} doc
 * @param {string} title
 * @returns {PDFDocument}
 */
function cardTitles(doc, title) {
  doc.font(`${fontDir}/OpenSans-Bold.ttf`).fontSize(20);
  const opts = {
    width: cellSize.w,
    height: cellSize.h,
    align: 'center',
    baseline: 'middle',
  };
  doc.fillColor(textColor);

  const chars = title.toUpperCase().split('').slice(0, 5);
  for (let col = 0; col < cols; col++) {
    doc.text(chars[ col ], topGrid[ col ].x, topGrid[ col ].y + cellSize.h / 2, opts);
    doc.text(chars[ col ], bottomGrid[ col ].x, bottomGrid[ col ].y + cellSize.h / 2, opts);
  }
}

/**
 * Fill in the top and bottom boxes on bingo cards with options. The cells arrays should be 24 in length if useFree is true, or 25 if it is
 * false.
 * @param {PDFDocument} doc
 * @param {string[]} topData data to print in the top cells
 * @param {string[]} bottomData data to print in the bottom cells
 * @param {boolean} useFree if true, "FREE SPACE" will be inserted at index 12
 * @returns {PDFDocument}
 */
function fillBoxes(doc, topData, bottomData, useFree) {
  doc.font(`${fontDir}/OpenSans-Regular.ttf`).fontSize(10);

  const opts = {
    width: cellSize.w,
    height: cellSize.h,
    align: 'center',
    baseline: 'middle',
  };
  doc.fillColor(textColor);
  const len = !!useFree ? 24 : 25;
  const rowLimit = rows - 1;

  // note rowIndex * rowLength + colIndex = array index
  for (let row = 1; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const gridIndex = row * rowLimit + col;
      const dataIndex = (row - 1) * rowLimit + col;
      if (useFree && gridIndex === 17) {
        doc.text("Free Space", topGrid[ gridIndex ].x, topGrid[ gridIndex ].y + cellSize.h / 2, opts);
        doc.text("Free Space", bottomGrid[ gridIndex ].x, bottomGrid[ gridIndex ].y + cellSize.h / 2, opts);
      } else {
        // todo: need to calculate the height of the text to determine y position
        doc.text(topData[ dataIndex ], topGrid[ gridIndex ].x, topGrid[ gridIndex ].y + cellSize.h / 2, opts);
        doc.text(bottomData[ dataIndex ], bottomGrid[ gridIndex ].x, bottomGrid[ gridIndex ].y + cellSize.h / 2, opts);
      }
    }
  }

}

/**
 * Generate a group of bingo cards onto a PDF in two up fashion. The PDF should then be able to be saved.
 * Note that this creates a PDF that is open ended. It's not piped to a file nor has end() been called on it.
 *
 * @param {number} num number of cards to create
 * @param {String[]} options array strings of things to print in the bingo cells. Min length 200 for randomness
 * @param {boolean} useFree default true
 * @param {string} title should be 5 characters, will be trimmed and uppercased
 * @returns {?} a PDF document as generated by pdfkit
 * @throws if num is less than 2
 * @throws if options is not an array
 * @throws if options.length is less than 200
 */
function makeCards(num, options, useFree = true, title = 'MOVIE') {
  if (num < 2) {
    throw new Error('makeCards: Must generate at least 2 bingo cards');
  }

  // we always want an even number of cards
  if (num % 2 !== 0) {
    num += 1;
  }

  if (!Array.isArray(options)) {
    throw new Error('makeCards: options is not an array');
  }

  if (options.length < 200) {
    throw new Error('makeCards: must have at least 200 options')
  }

  const doc = new PDFDocument({ margin: marginSize, autoFirstPage: false });
  calculateGrids();

  const pages = num / 2;
  let shuffled = options.slice();
  for (let page = 0; page < pages; page++) {
    doc.addPage();

    drawBoxes(doc);
    cardTitles(doc, title);  // todo? extend this at some point to for strings as titles

    // shuffle all options
    shuffled = fyShuffle(shuffled); // pass the shuffled options forward. Hopefully reduce chance of repeats

    // cut off the first N for top, second N for bottom of a page
    const topData = shuffled.slice(0, 25);
    const bottomData = shuffled.slice(25, 50);

    // call fillBoxes
    fillBoxes(doc, topData, bottomData, !!useFree);
  }


  // done
  return doc;
}

module.exports = {
  makeCards,
}
