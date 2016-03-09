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

IOWA.CountdownTimer.INTRO_PAUSE = 500; // # ms for intro to start.
IOWA.CountdownTimer.INTRO_LENGTH = 1500; // # ms for intro to stay visible.

IOWA.CountdownTimer.Intro = function(canvas, quality, parent) {
  this.parent = parent;

  this.radius = 0;
  this.center = {x: 0, y: 0};
  this.quality = quality;

  this.firstRun = true;
  this.count = 0;
  this.duration = 0.99;
  this.speed = 4;

  this.isStarted = false;
  this.isFinished = false;

  this.canvasElement = canvas;

  this.rectangles = [
    [
      {x: -2.6750303030303035, y: -0.9362575757575757},
      {x: -1.7387727272727271, y: -0.9362575757575757},
      {x: -1.7387727272727271, y: 0.9362575757575758},
      {x: -2.6750303030303035, y: 0.9362575757575758}
    ],
    [
      {x: -1.0463636363636364, y: -1.2858939393939395},
      {x: -0.9114696969696972, y: -1.2553787878787879},
      {x: -1.4995606060606061, y: 1.3444090909090909},
      {x: -1.634469696969697, y: 1.3138939393939395}
    ]
  ];

  this.circle = {x: 0, y: 0};
};

IOWA.CountdownTimer.Intro.prototype.update = function() {
  if (this.isFinished) {
    return true;
  }
  if (this.isStarted) {
    this.count += ((this.radius - this.parent.strokeWeight) - this.count) / this.speed;
  }

  var ctx = this.canvasElement.getContext('2d');

  var digit = (this.parent.format === 'horizontal') ? 1 : 5;

  if (this.count > ((this.radius - this.parent.strokeWeight) - 0.05)) {
    if (this.firstRun) {
      this.parent.bands[digit].aShift *= -1;
      this.parent.bands[digit].colors[0].hex = '#78909C';
      this.parent.bands[digit].oldShape = 0;
      this.parent.bands[digit].currentShape = 0;
      this.parent.bands[digit].isPlaying = true;
      this.parent.bands[digit].fade('in');
      this.firstRun = false;
      setTimeout(this.outro.bind(this), IOWA.CountdownTimer.INTRO_LENGTH);
    }
    this.parent.bands[digit].update();
  } else {
    ctx.save();
    ctx.scale(this.parent.pixelRatio, this.parent.pixelRatio);

    // draw circle1
    ctx.beginPath();
    ctx.arc(this.circle.x + this.center.x, this.circle.y + this.center.y, this.radius, 0, 2 * Math.PI, false);
    ctx.fillStyle = '#78909C';
    ctx.fill();

    // draw circle2
    var newRadius = this.count;
    ctx.beginPath();
    ctx.arc(this.circle.x + this.center.x, this.circle.y + this.center.y, newRadius, 0, 2 * Math.PI, false);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.restore();
  }

  ctx.save();
  ctx.scale(this.parent.pixelRatio, this.parent.pixelRatio);

  // draw the rest of the logo
  for (var i = 0; i < this.rectangles.length; i++) {
    ctx.beginPath();
    ctx.moveTo(this.rectangles[i][0].x * this.radius + this.center.x, this.rectangles[i][0].y * this.radius + this.center.y);
    for (var k = 1; k < this.rectangles[i].length; k++) {
      ctx.lineTo(this.rectangles[i][k].x * this.radius + this.center.x, this.rectangles[i][k].y * this.radius + this.center.y);
    }
    ctx.lineTo(this.rectangles[i][0].x * this.radius + this.center.x, this.rectangles[i][0].y * this.radius + this.center.y);
    ctx.fillStyle = '#78909C';
    ctx.fill();
  }

  ctx.restore();

  return false;
};

IOWA.CountdownTimer.Intro.prototype.start = function() {
  setTimeout(this.startTransition.bind(this), IOWA.CountdownTimer.INTRO_PAUSE);
};

IOWA.CountdownTimer.Intro.prototype.startTransition = function() {
  this.isStarted = true;
};

IOWA.CountdownTimer.Intro.prototype.outro = function() {
  this.isFinished = true;
};
