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

window.IOWA = window.IOWA || {};
IOWA.CountdownTimer = IOWA.CountdownTimer || {};

IOWA.CountdownTimer.Band = function(canvasElement, quality, parent, digits, defaultDigit) {
  this.canvasElement = canvasElement;
  this.parent = parent;

  this.aShift = 2 * (quality / 800);
  this.posShift = 0;
  this.strokeOffset = 0;

  this.digits = digits;

  this.oldShape = defaultDigit;
  this.currentShape = defaultDigit;

  this.radius = 0;
  this.center = {x: 0, y: 0};
  this.quality = quality;

  this.isPlaying = true;
  this.needsRedraw = true;

  this.colors = [
    {hex: '#ffffff', ratio: 1, size: 1, oldSize: 1, active: false, tween: null},
    {hex: '#EF5350', ratio: 0, size: 0, oldSize: 0, active: false, tween: null},
    {hex: '#5C6BC0', ratio: 0, size: 0, oldSize: 0, active: false, tween: null},
    {hex: '#26C6DA', ratio: 0, size: 0, oldSize: 0, active: false, tween: null},
    {hex: '#8cf2f2', ratio: 0, size: 0, oldSize: 0, active: false, tween: null},
    {hex: '#78909C', ratio: 0, size: 0, oldSize: 0, active: false, tween: null}
  ];
};

IOWA.CountdownTimer.Band.prototype.changeShape = function(newShape) {
  clearTimeout(this.fadeTimer);

  this.fade('in');

  this.oldShape = this.currentShape;

  this.currentShape = newShape;

  this.posShift = 0;

  if (this.tween) {
    this.tween.kill();
  }

  this.tween = TweenMax.to(this, 0.65, {posShift: 1, ease: Elastic.easeInOut.config(1, 1), delay: 0, onComplete: this.onChangeComplete, onCompleteParams: [this]});

  this.isPlaying = true;
};

IOWA.CountdownTimer.Band.prototype.fade = function(state) {
  if (state === 'in') {
    TweenMax.to(this.colors[0], 1, {size: 0.0});
    TweenMax.to(this.colors[1], 1, {size: 0.25});
    TweenMax.to(this.colors[2], 1, {size: 0.25});
    TweenMax.to(this.colors[3], 1, {size: 0.25});
    TweenMax.to(this.colors[4], 1, {size: 0.25});
    TweenMax.to(this.colors[5], 1, {size: 0});
  } else if (state === 'out') {
    // make sure the first color slot changes to default grey from white
    this.colors[0].hex = this.colors[5].hex;

    TweenMax.to(this.colors[0], 1, {size: 1});
    TweenMax.to(this.colors[1], 1, {size: 0});
    TweenMax.to(this.colors[2], 1, {size: 0});
    TweenMax.to(this.colors[3], 1, {size: 0});
    TweenMax.to(this.colors[4], 1, {size: 0});
    TweenMax.to(this.colors[5], 1, {size: 0, onComplete: this.stopPlaying.bind(this)});
  }
};

IOWA.CountdownTimer.Band.prototype.onChangeComplete = function(ref) {
  ref.fadeTimer = setTimeout(function() {
    ref.fade('out');
  }, 500 + Math.random() * 1000);
};

IOWA.CountdownTimer.Band.prototype.setQuality = function(n) {
  this.quality = n;
  this.needsRedraw = true;
};

IOWA.CountdownTimer.Band.prototype.getColor = function(ratio) {
  var tally = 0;
  var total = 0;
  var i;
  for (i = 0; i < this.colors.length; i++) {
    total += this.colors[i].size;
  }

  for (i = 0; i < this.colors.length; i++) {
    this.colors[i].ratio = this.colors[i].size / total;
    tally += this.colors[i].ratio;
    if (ratio <= tally) {
      return this.colors[i].hex;
    }
  }

  return this.colors[0].hex;
};

IOWA.CountdownTimer.Band.prototype.update = function() {
  if (!this.isPlaying && !this.parent.drawAll && !this.needsRedraw) {
    return;
  }

  var ctx = this.canvasElement.getContext('2d');
  ctx.save();
  ctx.scale(this.parent.pixelRatio, this.parent.pixelRatio);
  ctx.lineWidth = this.parent.strokeWeight;
  ctx.lineJoin = ctx.lineCap = 'round';

  var overClearX = (this.parent.bandGutter / 2) + 2;
  var overClearY = ((this.parent.bandGutter + this.parent.bandPadding) / 2) + 2;

  ctx.clearRect(
    (this.center.x - this.radius) - overClearX / 2,
    (this.center.y - this.radius) - overClearY / 2,
    (this.radius * 2) + overClearX,
    (this.radius * 2) + overClearY
  );

  var lastColor;
  var oldPoints = this.digits[this.oldShape].points;
  var currentPoints = this.digits[this.currentShape].points;

  for (var i = 0; i < currentPoints.length; i++) {
    var next_inc = (i < (currentPoints.length - 1)) ? i + 1 : 0;
    var x2 = this.radius * (oldPoints[next_inc].x + (currentPoints[next_inc].x - oldPoints[next_inc].x) * this.posShift) + this.center.x;
    var y2 = this.radius * (oldPoints[next_inc].y + (currentPoints[next_inc].y - oldPoints[next_inc].y) * this.posShift) + this.center.y;

    var colorRatio = (i + this.strokeOffset) / currentPoints.length;
    if (colorRatio > 1) {
      colorRatio = (i + this.strokeOffset - currentPoints.length) / currentPoints.length;
    }
    var newColor = this.getColor(colorRatio);

    if (newColor === lastColor) {
      ctx.lineTo(x2, y2);
    } else {
      if (lastColor) {
        ctx.strokeStyle = lastColor;
        ctx.stroke();
      }

      var x = this.radius * (oldPoints[i].x + (currentPoints[i].x - oldPoints[i].x) * this.posShift) + this.center.x;
      var y = this.radius * (oldPoints[i].y + (currentPoints[i].y - oldPoints[i].y) * this.posShift) + this.center.y;

      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x2, y2);

      lastColor = newColor;
    }
  }
  ctx.strokeStyle = lastColor;
  ctx.stroke();

  this.strokeOffset -= this.aShift;
  if (this.strokeOffset > currentPoints.length) {
    this.strokeOffset = 0;
  } else if (this.strokeOffset < 0) {
    this.strokeOffset = currentPoints.length - 1;
  }

  ctx.restore();

  this.needsRedraw = false;
};

IOWA.CountdownTimer.Band.prototype.shudder = function(state) {
  if (!this.isPlaying && state) {
    this.isPlaying = true;
    this.fade('in');
    this.isShuddering = true;
  } else if (this.isShuddering && this.isPlaying && !state) {
    clearTimeout(this.fadeTimer);
    var ref = this;
    this.fadeTimer = setTimeout(function() {
      ref.fade('out');
    }, 500 + Math.random() * 1000);
    this.isShuddering = false;
  }
};

IOWA.CountdownTimer.Band.prototype.redraw = function() {
  this.needsRedraw = true;
};

IOWA.CountdownTimer.Band.prototype.renderFlat = function() {
  this.colors[0].size = 0;
  this.colors[1].size = 0;
  this.colors[2].size = 0;
  this.colors[3].size = 0;
  this.colors[4].size = 0;
  this.colors[5].size = 1;

  this.needsRedraw = true;
};

IOWA.CountdownTimer.Band.prototype.stopPlaying = function() {
  this.renderFlat();

  this.isPlaying = false;
};
