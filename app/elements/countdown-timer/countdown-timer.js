/**
 * Copyright 2016 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

IOWA.CountdownTimer.MOBILE_BREAKPOINT = 501;
IOWA.CountdownTimer.TABLET_BREAKPOINT = 960;
IOWA.CountdownTimer.DESKTOP_BREAKPOINT = 1400;
IOWA.CountdownTimer.XLARGE_BREAKPOINT = 4000;

IOWA.CountdownTimer.Core = function(targetDate, elem) {
  this.targetDate = targetDate;
  this.containerDomElement = elem;

  this.quality = 240;
  this.isPlaying = false;
  this.firstRun = true;
  this.introRunning = false;
  this.maxWidth = IOWA.CountdownTimer.TABLET_BREAKPOINT;

  this.canvasElement = document.createElement('canvas');

  this.countdownMargin = 100;
  this.bandGutter = 40;
  this.bandPadding = 8;
  this.strokeWeight = 3;

  this.pixelRatio = window.devicePixelRatio;

  this.unitsAdded = false;
  this.drawAll = false;

  this.posShift = 0;
  this.setCanvasSize();

  this.onVisibilityChange = this.onVisibilityChange.bind(this);
  this.onResize = this.onResize.bind(this);
  this.onMouseMove = this.onMouseMove.bind(this);
  this.onFrame = this.onFrame.bind(this);
};

IOWA.CountdownTimer.Core.prototype.onVisibilityChange = function() {
  if (document.hidden) {
    this.pause();
  } else {
    this.play();
  }
};

IOWA.CountdownTimer.Core.prototype.attachEvents = function() {
  this.containerDomElement.appendChild(this.canvasElement);

  document.addEventListener('visibilitychange', this.onVisibilityChange, false);
  window.addEventListener('resize', this.onResize);
  this.containerDomElement.addEventListener('mousemove', this.onMouseMove);
};

IOWA.CountdownTimer.Core.prototype.detachEvents = function() {
  document.removeEventListener('visibilitychange', this.onVisibilityChange, false);
  window.removeEventListener('resize', this.onResize);
  this.containerDomElement.removeEventListener('mousemove', this.onMouseMove);
};

IOWA.CountdownTimer.Core.prototype.start = function() {
  this.lastNumbers = this.unitDistance(this.targetDate, new Date());

  this.getFormat();
  this.getDigits();
  this.getLayout();

  this.bands = this.drawBands();

  this.getSeparators();

  this.launchIntro();
  this.play();
};

IOWA.CountdownTimer.Core.prototype.pad = function(num) {
  var str = num.toString();

  if (str.length === 1) {
    str = '0' + str;
  }

  return str;
};

IOWA.CountdownTimer.Core.prototype.checkTime = function() {
  var distance = this.unitDistance(this.targetDate, new Date());

  if (this.firstRun || this.lastNumbers.days !== distance.days) {
    this.bands[0].changeShape(this.digits[Math.floor(distance.days / 10)]);
    this.bands[1].changeShape(this.digits[distance.days % 10]);
  }

  if (this.firstRun || this.lastNumbers.hours !== distance.hours) {
    this.bands[2].changeShape(this.digits[Math.floor(distance.hours / 10)]);
    this.bands[3].changeShape(this.digits[distance.hours % 10]);
  }

  if (this.firstRun || this.lastNumbers.minutes !== distance.minutes) {
    this.bands[4].changeShape(this.digits[Math.floor(distance.minutes / 10)]);
    this.bands[5].changeShape(this.digits[distance.minutes % 10]);
  }

  if (this.firstRun || this.lastNumbers.seconds !== distance.seconds) {
    this.bands[6].changeShape(this.digits[Math.floor(distance.seconds / 10)]);
    this.bands[7].changeShape(this.digits[distance.seconds % 10]);
  }

  this.lastNumbers = distance;
  this.firstRun = false;

  this.containerDomElement.setAttribute('aria-label',
    distance.days + ' days, ' +
    distance.hours + ' hours, ' +
    distance.minutes + ' minutes, ' +
    distance.seconds + ' seconds until Google I/O');
};

IOWA.CountdownTimer.Core.prototype.onFrame = function() {
  if (!this.isPlaying) {
    return;
  }

  var ctx = this.canvasElement.getContext('2d');

  if (this.introRunning) {
    ctx.save();
    ctx.scale(this.pixelRatio, this.pixelRatio);
    ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
    ctx.restore();
    this.intro.update();
    requestAnimationFrame(this.onFrame);
    return;
  }

  this.checkTime();

  var i;
  // clear relevant canvas area
  ctx.save();
  ctx.scale(this.pixelRatio, this.pixelRatio);

  if (this.drawAll) {
    ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
  } else {
    for (i = 0; i <= 3; i++) {
      if (this.bands[i * 2].isPlaying && this.bands[i * 2 + 1].isPlaying) {
        ctx.clearRect(
          this.bands[i * 2].center.x - this.layout.radius - this.bandGutter / 2,
          this.bands[i * 2].center.y - this.layout.radius - this.bandGutter,
          this.layout.radius * 4 + this.bandGutter + this.bandPadding * 2,
          this.layout.radius * 2 + this.bandGutter * 2);
      }
    }
  }

  ctx.restore();

  // add units
  if (!this.unitsAdded || this.drawAll) {
    this.addUnits();
    this.unitsAdded = true;
  }

  // add separating slashes
  if (this.format === 'horizontal') {
    this.addSeparators();
  }

  // update bands
  for (i = 0; i < this.bands.length; i++) {
    this.bands[i].update();
  }

  requestAnimationFrame(this.onFrame);
};

IOWA.CountdownTimer.Core.prototype.unitDistance = function(target, now) {
  var difference = (new Date(target - now)).getTime() / 1000;

  var secondsInMinutes = 60;
  var secondsInHours = (secondsInMinutes * 60);
  var secondsInDays = (secondsInHours * 24);

  var days = Math.floor(difference / secondsInDays);
  difference %= secondsInDays;

  var hours = Math.floor(difference / secondsInHours);
  difference %= secondsInHours;

  var minutes = Math.floor(difference / secondsInMinutes);
  difference %= secondsInMinutes;

  var seconds = Math.floor(difference);

  return {
    days: days,
    hours: hours,
    minutes: minutes,
    seconds: seconds
  };
};

IOWA.CountdownTimer.Core.prototype.pause = function() {
  if (!this.isPlaying) {
    return;
  }

  this.isPlaying = false;
};

IOWA.CountdownTimer.Core.prototype.play = function() {
  if (this.isPlaying) {
    return;
  }

  this.isPlaying = true;
  this.onFrame();
};

IOWA.CountdownTimer.Core.prototype.onMouseMove = function(e) {
  if (!this.bands) {
    return;
  }

  var mouseX = e.offsetX;
  var mouseY = e.offsetY;

  for (var i = 0; i < this.bands.length; i++) {
    if (mouseX > (this.bands[i].center.x - this.bands[i].radius) && mouseX < (this.bands[i].center.x + this.bands[i].radius) && mouseY > (this.bands[i].center.y - this.bands[i].radius) && mouseY < (this.bands[i].center.y + this.bands[i].radius)) {
      this.bands[i].shudder(true);
    } else if (this.bands[i].isShuddering) {
      this.bands[i].shudder(false);
    }
  }
};

IOWA.CountdownTimer.Core.prototype.getFormat = function() {
  this.format = (this.containerDomElement.offsetWidth < IOWA.CountdownTimer.MOBILE_BREAKPOINT) ? 'stacked' : 'horizontal';
};

IOWA.CountdownTimer.Core.prototype.launchIntro = function() {
  this.introRunning = true;
  var center;
  if (this.format === 'horizontal') {
    center = this.getBandCenter(1);
  } else {
    center = this.getBandCenter(5);
  }

  this.intro = new IOWA.CountdownTimer.Intro(this.canvasElement, this.layout.radius, center, this.quality, this);
};

IOWA.CountdownTimer.Core.prototype.closeIntro = function() {
  this.introRunning = false;

  var ctx = this.canvasElement.getContext('2d');
  ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
};

IOWA.CountdownTimer.Core.prototype.drawBands = function() {
  var n = 8;
  var bands = [];
  var time = {
    digit_0: this.pad(this.lastNumbers.days)[0],
    digit_1: this.pad(this.lastNumbers.days)[1],

    digit_2: this.pad(this.lastNumbers.hours)[0],
    digit_3: this.pad(this.lastNumbers.hours)[1],

    digit_4: this.pad(this.lastNumbers.minutes)[0],
    digit_5: this.pad(this.lastNumbers.minutes)[1],

    digit_6: this.pad(this.lastNumbers.seconds)[0],
    digit_7: this.pad(this.lastNumbers.seconds)[1]
  };

  for (var i = 0; i < n; i++) {
    var bandCenter = this.getBandCenter(i);
    var defaultDigit = time['digit_' + i];
    bands.push(new IOWA.CountdownTimer.Band(this.canvasElement, this.layout.radius, bandCenter, this.quality, this, i, defaultDigit));
  }

  return bands;
};

IOWA.CountdownTimer.Core.prototype.getBandCenter = function(n) {
  var x;
  var y;
  var w = this.containerDomElement.offsetWidth;
  var h = this.containerDomElement.offsetHeight;
  var offset;
  if (this.format === 'horizontal') {
    offset = Math.floor(n / 2);
    x = this.layout.x + this.layout.radius + this.layout.radius * 2 * n + (this.bandPadding * n) + offset * (this.bandGutter - this.bandPadding);
    y = this.layout.y + this.layout.radius;
  } else {
    offset = Math.floor(n / 2);
    x = this.layout.x + this.layout.radius + this.layout.radius * 2 * n + (this.bandPadding * n) + offset * (this.bandGutter - this.bandPadding);
    y = h / 2 - w / 4;
    offset = Math.floor(n / 4);
    if (offset > 0) {
      y = h / 2 + w / 4;
      x -= w - this.countdownMargin * 2 + this.bandGutter;
    }
  }
  return {x: x, y: y};
};

IOWA.CountdownTimer.Core.prototype.addUnits = function() {
  var offset = 40;
  var ctx = this.canvasElement.getContext('2d');
  ctx.save();
  ctx.scale(this.pixelRatio, this.pixelRatio);
  ctx.font = '12px Roboto';
  ctx.fillStyle = '#546E7A'; // blue grey 600
  ctx.textAlign = 'center';

  ctx.fillText('Days', this.bands[0].center.x + this.layout.radius + this.bandPadding / 2, this.bands[0].center.y + this.layout.radius + offset);
  ctx.fillText('Hours', this.bands[2].center.x + this.layout.radius + this.bandPadding / 2, this.bands[2].center.y + this.layout.radius + offset);
  ctx.fillText('Minutes', this.bands[4].center.x + this.layout.radius + this.bandPadding / 2, this.bands[4].center.y + this.layout.radius + offset);
  ctx.fillText('Seconds', this.bands[6].center.x + this.layout.radius + this.bandPadding / 2, this.bands[6].center.y + this.layout.radius + offset);
  ctx.restore();
};

IOWA.CountdownTimer.Core.prototype.addSeparators = function() {
  var ctx = this.canvasElement.getContext('2d');

  ctx.save();
  ctx.scale(this.pixelRatio, this.pixelRatio);

  for (var i = 0; i < this.separators.length; i++) {
    ctx.clearRect(this.separators[i].x - 2, this.separators[i].y - 2, this.separators[i].w + 4, this.separators[i].h + 4);
    ctx.beginPath();
    ctx.moveTo(this.separators[i].x, this.separators[i].y);
    ctx.lineTo(this.separators[i].x + this.separators[i].w, this.separators[i].y + this.separators[i].h);
    ctx.lineWidth = this.strokeWeight;
    ctx.strokeStyle = '#CFD8DC';
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  ctx.restore();
};

IOWA.CountdownTimer.Core.prototype.getSeparators = function() {
  this.separators = [];

  for (var i = 1; i <= 3; i++) {
    var x = this.bands[i * 2].center.x - this.layout.radius - (this.bandPadding + this.bandGutter) / 2;
    var y = this.bands[i * 2].center.y + this.layout.radius - this.bandGutter / 1.6;
    this.separators.push({x: x, y: y, w: this.bandGutter / 2, h: this.bandGutter / 1.8});
  }
};

IOWA.CountdownTimer.Core.prototype.getDigits = function() {
  this.digits = [];

  for (var i = 0; i < 10; i++) {
    var path = this.getPath('path-' + i);

    var d;
    var k;
    if (path.points.length > this.quality) {
      d = path.points.length - this.quality;
      for (k = 0; k < d; k++) {
        path.points.pop();
      }
    }

    if (path.points.length < this.quality) {
      d = this.quality - path.points.length;
      for (k = 0; k < d; k++) {
        path.points.push(path.points[path.points.length - 1]);
      }
    }

    this.digits.push(path);
  }
};

IOWA.CountdownTimer.Core.prototype.getPath = function(svg) {
  var svgHeight = 132 / 2;

  var path = document.getElementById(svg);
  var length = path.getTotalLength();
  var pointList = path.getPathData();

  var quality = this.quality;
  var points = [];
  // var oldPathSeg = 0;

  for (var i = 0; i < length; i += length / quality) {
    var point = path.getPointAtLength(i);
    // var pathSeg = path.getPathSegAtLength(i);
    // ADD ACTUAL SVG POINTS?
    // if(pathSeg != oldPathSeg){
    //  if(pointList[oldPathSeg].type === 'C' ) {
    //    points.push({x:(pointList[oldPathSeg].values[4]-svgHeight)/svgHeight, y:(pointList[oldPathSeg].values[5]-svgHeight)/svgHeight});
    //  } else {
    //    points.push({x:(pointList[oldPathSeg].values[0]-svgHeight)/svgHeight, y:(pointList[oldPathSeg].values[1]-svgHeight)/svgHeight});
    //  }

    // }
    points.push({x: (point.x - svgHeight) / svgHeight, y: (point.y - svgHeight) / svgHeight});
    // oldPathSeg = pathSeg;
  }

  return {
    points: points,
    pointList: pointList
  };
};

IOWA.CountdownTimer.Core.prototype.getLayout = function() {
  var canvasW = this.containerDomElement.offsetWidth;
  var canvasH = this.containerDomElement.offsetHeight;

  // set spacing variables
  if (canvasW < IOWA.CountdownTimer.MOBILE_BREAKPOINT) {
    this.countdownMargin = 14;
    this.bandGutter = 16;
    this.bandPadding = 4;
  } else if (canvasW < IOWA.CountdownTimer.TABLET_BREAKPOINT) {
    this.countdownMargin = 40;
    this.bandGutter = 16;
    this.bandPadding = 4;
  } else if (canvasW < this.maxWidth) {
    this.countdownMargin = 4;
    this.bandGutter = 16;
    this.bandPadding = 4;
  } else if (canvasW > this.maxWidth) {
    this.countdownMargin = Math.round((canvasW - this.maxWidth) / 2);
    this.bandGutter = 32;
    this.bandPadding = 8;
  }

  // set stroke weight
  if (canvasW < IOWA.CountdownTimer.MOBILE_BREAKPOINT) {
    this.strokeWeight = 2.5;
  } else if (canvasW < IOWA.CountdownTimer.TABLET_BREAKPOINT) {
    this.strokeWeight = 2.0;
  } else if (canvasW < IOWA.CountdownTimer.DESKTOP_BREAKPOINT) {
    this.strokeWeight = 3.0;
  } else if (canvasW < IOWA.CountdownTimer.XLARGE_BREAKPOINT) {
    this.strokeWeight = 3.5;
  }

  var w = canvasW - this.countdownMargin * 2;
  var h = canvasH;
  var r = (w - this.bandGutter * 3 - this.bandPadding * 4) / 8 / 2;
  var x = this.countdownMargin;
  var y = h / 2 - r;

  if (canvasW < IOWA.CountdownTimer.MOBILE_BREAKPOINT) {
    r = (w - this.bandGutter - this.bandPadding * 2) / 4 / 2;
  }

  this.layout = {
    x: x,
    y: y,
    radius: r
  };
};

IOWA.CountdownTimer.Core.prototype.onResize = function() {
  if (!this.drawAll) {
    var ctx = this.canvasElement.getContext('2d');
    ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
  }

  this.setCanvasSize();

  this.getFormat();
  this.getLayout();
  this.unitsAdded = false;

  for (var i = 0; i < this.bands.length; i++) {
    this.bands[i].radius = this.layout.radius;
    this.bands[i].center = this.getBandCenter(i);
    this.bands[i].resize();
  }

  var center;
  if (this.format === 'horizontal') {
    center = this.getBandCenter(1);
  } else {
    center = this.getBandCenter(5);
  }

  if (this.intro) {
    this.intro.center = center;
  }

  this.getSeparators();
};

IOWA.CountdownTimer.Core.prototype.setCanvasSize = function() {
  this.canvasElement.width = this.containerDomElement.offsetWidth * this.pixelRatio;
  this.canvasElement.height = this.containerDomElement.offsetHeight * this.pixelRatio;

  this.canvasElement.style.width = this.containerDomElement.offsetWidth + 'px';
  this.canvasElement.style.height = this.containerDomElement.offsetHeight + 'px';
};
