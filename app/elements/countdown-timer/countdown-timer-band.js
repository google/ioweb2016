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

IOWA.CountdownTimer.Band = function(canvasElement, radius, center, quality, parent, id, defaultDigit) {
  this.canvasElement = canvasElement;
  this.parent = parent;
  this.id = id;

  this.aShift = 2 * (quality / 800);
  this.posShift = 0;
  this.strokeOffset = 0;

  this.counter = 0;

  this.digits = this.parent.digits;

  var n = defaultDigit;

  this.oldShape = this.digits[n];
  this.currentShape = this.digits[n];

  this.radius = radius;
  this.center = center;
  this.quality = quality;

  this.x = this.center.x;
  this.y = this.center.y;

  this.inc = 0;

  this.isPlaying = true;
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

  this.tween = TweenMax.to(this, 0.75, {posShift: 1, ease: Elastic.easeInOut.config(1, 1), delay: 0, onComplete: this.onChangeComplete, onCompleteParams: [this]});

  this.play();
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
};

IOWA.CountdownTimer.Band.prototype.update = function() {
  if (!this.isPlaying && !this.parent.drawAll) {
    return;
  }

  var ctx = this.canvasElement.getContext('2d');
  ctx.save();
  ctx.scale(this.parent.pixelRatio, this.parent.pixelRatio);

  var overClear = this.parent.pixelRatio * 2;
  ctx.clearRect(
    (this.center.x - this.radius) - overClear,
    (this.center.y - this.radius) - overClear,
    (this.radius * 2) + (overClear * 2),
    (this.radius * 2) + (overClear * 2)
  );

  var byColorCommands = {};
  var color;

  for (var i = 0; i < this.quality; i++) {
    var inc = i;

    inc = Math.floor(inc);

    if (this.digits[0].points.length < i) {
      continue;
    }

    var x = this.radius * (this.oldShape.points[i].x + (this.currentShape.points[i].x - this.oldShape.points[i].x) * this.posShift) + this.center.x;
    var y = this.radius * (this.oldShape.points[i].y + (this.currentShape.points[i].y - this.oldShape.points[i].y) * this.posShift) + this.center.y;

    var next_inc = (i < (this.quality - 1)) ? i + 1 : 0;
    var x2 = this.radius * (this.oldShape.points[next_inc].x + (this.currentShape.points[next_inc].x - this.oldShape.points[next_inc].x) * this.posShift) + this.center.x;
    var y2 = this.radius * (this.oldShape.points[next_inc].y + (this.currentShape.points[next_inc].y - this.oldShape.points[next_inc].y) * this.posShift) + this.center.y;

    var ratio;

    ratio = (i + this.strokeOffset) / this.quality;
    if ((i + this.strokeOffset) > this.quality) {
      ratio = (i + this.strokeOffset - this.quality) / this.quality;
    }

    color = this.getColor(ratio);
    byColorCommands[color] = byColorCommands[color] || [];
    byColorCommands[color].push({
      x: x,
      y: y,
      x2: x2,
      y2: y2
    });
  }

  ctx.lineWidth = this.parent.strokeWeight;
  ctx.lineCap = 'round';

  var commands;
  var command;
  for (color in byColorCommands) {
    if (byColorCommands.hasOwnProperty(color)) {
      commands = byColorCommands[color];

      ctx.strokeStyle = color;
      for (var j = 0; j < commands.length; j++) {
        command = commands[j];
        ctx.beginPath();
        ctx.moveTo(command.x, command.y);
        ctx.lineTo(command.x2, command.y2);
        ctx.stroke();
      }
    }
  }

  this.strokeOffset -= this.aShift;
  if (this.strokeOffset > this.quality) {
    this.strokeOffset = 0;
  } else if (this.strokeOffset < 0) {
    this.strokeOffset = this.quality - 1;
  }

  ctx.restore();
};

IOWA.CountdownTimer.Band.prototype.shudder = function(state) {
  if (!this.isPlaying && state) {
    this.isPlaying = true;
    this.fade('in');
    this.isShuddering = true;
  } else if (this.isPlaying && !state) {
    clearTimeout(this.fadeTimer);
    var ref = this;
    this.fadeTimer = setTimeout(function() {
      ref.fade('out');
    }, 500 + Math.random() * 1000);
    this.isShuddering = false;
  }
};

IOWA.CountdownTimer.Band.prototype.resize = function() {
  if (!this.isPlaying) {
    this.isPlaying = true;
    this.update();
    this.isPlaying = false;
  } else {
    this.update();
  }
};

IOWA.CountdownTimer.Band.prototype.play = function() {
  this.isPlaying = true;
};

IOWA.CountdownTimer.Band.prototype.renderFlat = function() {
  this.colors[0].size = 0;
  this.colors[1].size = 0;
  this.colors[2].size = 0;
  this.colors[3].size = 0;
  this.colors[4].size = 0;
  this.colors[5].size = 1;

  this.update();
};

IOWA.CountdownTimer.Band.prototype.stopPlaying = function() {
  this.renderFlat();

  this.isPlaying = false;
};
