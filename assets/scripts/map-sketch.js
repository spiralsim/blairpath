var canvas, images = {
	floors: [],
	site: null
};
const assetPath = "";

// Loads maps
function preload () {
	for (let i = 1; i <= 4; i++) images.floors.push(loadImage(`${assetPath}/maps/f${i}.png`));
	images.site = loadImage(`${assetPath}/maps/site.png`);
}

function getCanvasDivWidth() {
	return document.getElementById('canvas').getBoundingClientRect().width;
}

function inCanvas () {
	return mouseX > 0;
}

/**
 * Represents a point (`p5.Vector` or `Number[]`) as a human-readable string.
 * Each coordinate is rounded.
 */
function stringifyPoint(p) {
	if (!p) return '(None)';
	else if (p instanceof p5.Vector) return `(${round(p.x)}, ${round(p.y)})`;
	else if (p instanceof Array) return `(${p.map(c => round(c)).join(', ')})`;
	else throw new TypeError('p must be a p5.Vector or array of numbers');
}

function formatJSON (data) {
	return JSON.stringify(data, null, 4).replace(/ {4}/g, '\t');
}

// Compute / recompute the length of a link and adjust properties accordingly
function computeLength (link) {
	// If no valid points are given, both distances should be 0
	link.gLen = link.vLen = 0;
	if (!link.points[0] || !link.points[1]) return;

	if (link.points[0][2] == link.points[1][2]) link.gLen = dist(link.points[0][0], link.points[0][1], link.points[1][0], link.points[1][1]);
	else link.vLen = constants.METERS_PER_FLOOR / constants.METERS_PER_PIXEL;
}
// Delete a link #(id), remove all records of the link, etc.
function deleteLink (id) {
	links.forEach((link, idx) => {
		if (link.id == id) {
			// Remove this link from the list of links in the node(s) it was previous attached to, if applicable
			for (let i = 0; i < 2; i++) {
				if (link.nodes[i]) {
					var linkedNode = nodes.find(n => n.id == link.nodes[i]),
						currLinkIdx = linkedNode.links.indexOf(link.id);
					if (currLinkIdx >= 0) linkedNode.links.splice(currLinkIdx, 1);
				}
			}

			if (devData.link == link) devData.link = null;

			links.splice(idx, 1);
		}
	});
}
// Delete a node #(id), remove all records of the node, etc.
function deleteNode (id) { 
	nodes.forEach((node, idx) => {
		if (node.id == id) {
			// Unlink all attached links
			const linksToDelete = node.links.slice(0);
			linksToDelete.forEach(l => {
				deleteLink(l);
			});

			// Remove node from array
			nodes.splice(idx, 1);
			if (id == devData.node.id) devData.node = null;
		}
	});
}
// Split the link #(id) into two sub-links from a point [x, y] (p) on floor (f)
function splitLink (id, p, f) {
	links.forEach((link, idx) => {
		if (link.id == id) {
			// Create new node
			var newNode = {
				pos: p,
				floor: f,
				id: ~~(random(1000000))
			}, newLinks = [0, 1].map(i => {
				return {
					nodes: [link.nodes[i], newNode.id],
					points: [link.points[i], [... p, f]],
					id: ~~(random(1000000))
				};
			});
			// Register the new links in the new node
			newNode.links = newLinks.map(l => l.id);
			nodes.push(newNode);
			// Register the new links in the old nodes
			[0, 1].forEach(i => {
				nodes.find(n => n.id == link.nodes[i]).links.push(newLinks[i].id);
			});
			// Compute the lengths of the new links and add them to the array
			newLinks.forEach(l => {
				computeLength(l);
				links.push(l);
			});
			
			// Delete the current link
			deleteLink(id);
		}
	});
}
// Merge two links from a node #(id)
function mergeLinks (id) {
	nodes.forEach((node, idx) => {
		if (node.id == id) {
			const currLinks = node.links.map(l => links.find(link => link.id == l)),
			// Find the other nodes that the attached links are connected to
			      otherNodeIDs = currLinks.map(l => l.nodes.find(n => n != id)),
			      otherNodeObjs = otherNodeIDs.map(i => nodes.find(n => n.id == i));
			// Create new link
			var newLink = {
				nodes: otherNodeIDs,
				points: otherNodeObjs.map(n => [... n.pos, n.floor]),
				id: ~~(random(1000000))
			};
			computeLength(newLink);
			links.push(newLink);
			// Register new link in its nodes
			otherNodeObjs.forEach(n => n.links.push(newLink.id));
			
			// Delete the current node
			deleteNode(id);
		}
	});
}
// Compute distance between a point [x, y] (p) and segment [x, y] (a) - [x, y] (b)
// Adapted from https://stackoverflow.com/questions/849211/shortest-distance-between-a-point-and-a-line-segment
function distToLine (p, a, b) {
	var l = pow(dist(a[0], a[1], b[0], b[1]), 2);
	if (l == 0) return pow(dist(p[0], p[1], a[0], a[1]), 2);
	var t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / l;
	t = max(0, min(1, t));
	return dist(p[0], p[1], a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]));
}

var loaded = false, lastFrameRate = 60, lastUpdate = framesSinceUpdate = 0;

/*
	Navigation
*/
var _floor = 1;
const MAP_DIM_TMP = [1083, 500],
	SITE_DIM_TMP = [2263, 1267],
	SITE_PLAN_OFFSET_TMP = [-525, -248];
var MAP_DIM,
	SITE_DIM,
	SITE_PLAN_OFFSET;
const DEFAULT_ZOOM = 1 / 2, SCROLL_ZOOM_RATE = 1.01;
// All positions are given as pixel coordinates

/*
	Physical position = Location on the canvas, in px
	Virtual position = Location that the cursor corresponds to on the floor
	plan's original image (at original scale, meaning 1 px on the image = 1 px
	on the screen)
 */
const VIEW = {
	// Physical position of the floor plan's top-left corner
	physPos: null,
	zoom: null,
	pan(delta) {
		VIEW.physPos.add(delta);
	},
	applyZoom(scaleFactor, center = createVector(width / 2, height / 2)) {
		VIEW.physPos = p5.Vector.add(
			center, p5.Vector.sub(VIEW.physPos, center).mult(scaleFactor)
		);
		VIEW.zoom *= scaleFactor;
	},
	reset() {
		VIEW.zoom = DEFAULT_ZOOM;
		const CANVAS_CENTER = createVector(width / 2, height / 2);
		VIEW.physPos = CANVAS_CENTER.sub(p5.Vector.mult(MAP_DIM, VIEW.zoom / 2));
	}
};

const CURSOR = {
	get physPos() {
		return createVector(mouseX, mouseY);
	},
	get virtPos() {
		return p5.Vector.sub(CURSOR.physPos, VIEW.physPos).div(VIEW.zoom);
	}
};

var showOptions = {
	'show-floor-plan': null,
	'show-site-plan': null,
	'show-place-dots': null,
	'show-path': null,
	'show-dev-tools': null
};
for (let option in showOptions) {
	const checkbox = document.querySelector(`#${option}`);
	function updateOption() {
		showOptions[option] = checkbox.checked;
	}
	updateOption();
	checkbox.addEventListener('change', updateOption);
}

var ruler;

// What the cursor is displayed as (changes between ARROW, HAND, and MOVE)
var cursorType;

/*
	Developer Mode
*/
var devData = {
	room: null,
	node: null,
	link: null,
	awaiting: null, // Stores a user action that the program is waiting for, if applicable
	msg: { txt: null, r: null, g: null, a: 0 },
	pushMsg: (txt, type) => {
		if (type != 2) devData.awaiting = null;
		devData.msg = {
			txt: txt,
			r: (type == 0) * 255, // Red: error
			g: (type == 1) * 255, // Green: success
			b: (type == 2) * 255,  // Blue: awaiting user interaction
			a: 400
		};
	}
};

/*
	p5.js Event Functions
*/
var setup = function () {
	canvas = createCanvas(getCanvasDivWidth(), windowHeight);
	canvas.parent("canvas");

	MAP_DIM = createVector(...MAP_DIM_TMP);
	SITE_DIM = createVector(...SITE_DIM_TMP);
	SITE_PLAN_OFFSET = createVector(...SITE_PLAN_OFFSET_TMP);
	VIEW.reset();
};

var windowResized = function () {
	resizeCanvas(getCanvasDivWidth(), windowHeight);
}

function mousePressed() {
	rooms.forEach(r => {
		if (r.hover) {
			// Add room
			if (mouseButton == LEFT) {
				// Handle edge case where there are no rows to begin with
				if (!rows.length) addPoint();
				// Find the number of the first empty point input
				var i = 1, input;
				for ( ; i <= rows.length; i++) {
					input = document.getElementById("point-" + i);
					if (!input.value) break;
				}
				// If we are at the last row and it is still full, create a new row and go to that one
				if (input.value && i == rows.length + 1) {
					addPoint();
					input = document.getElementById("point-" + i);
				}
				// Assign the name of the room and the "valid" color to the input
				input.value = r.id;
				input.style["background-color"] = "lightgreen";
			} else {
				// Remove room
				for (let i = 1; i <= rows.length; i++) {
					input = document.getElementById("point-" + i);
					if (input.value == r.id) {
						removePoint(i);
						break;
					}
				}
			}
		}
	});
};

function mouseDragged() {
	if (!inCanvas()) return;
	cursorType = MOVE;
	VIEW.pan(createVector(movedX, movedY));
};

function mouseWheel({ delta }) {
	if (!inCanvas()) return;
	VIEW.applyZoom(SCROLL_ZOOM_RATE ** delta, CURSOR.physPos);
};

function draw() {
	// Remove loading message
	if (!loaded) {
		document.getElementById("map-placeholder").remove();
		loaded = true;
	}

	background(255);

	/*
		Map Display
	*/
	push();
	
	// Apply view transformations
	translate(VIEW.physPos);
	scale(VIEW.zoom);

	// images
	noFill();
	imageMode(CORNER);

	// Site overlay
	if (showOptions[`show-site-plan`]) {
		tint(255, 64);
		image(images.site, SITE_PLAN_OFFSET.x, SITE_PLAN_OFFSET.y);
		if (showOptions[`show-dev-tools`]) {
			stroke(0, 0, 255);
			rect(SITE_PLAN_OFFSET.x, SITE_PLAN_OFFSET.y, SITE_DIM.x, SITE_DIM.y);
		}
	}

	// Floor plan
	if (showOptions[`show-floor-plan`]) {
		tint(255, 255);
		image(images.floors[_floor - 1], 0, 0);
		if (showOptions[`show-dev-tools`]) {
			stroke(255, 0, 0);
			rect(0, 0, MAP_DIM.x, MAP_DIM.y);
		}
	}

	// Points
	if (showOptions[`show-place-dots`]) {
		// Display dots for room selection
		// Iteration 1: Display the point and detect hovering if applicable
		for (let i = 0, hovering = false; i < rooms.length; i++) {
			var room = rooms[i];
			if (room.floor == _floor && room.center) {
				if (CURSOR.virtPos.dist(createVector(...room.center)) < 5 / VIEW.zoom &&
				!hovering) {
					room.hover = true;
					hovering = true;
					cursorType = HAND;
				} else room.hover = false;

				fill(255);
				if (room.hover) fill(mouseIsPressed ? color(250, 85, 85) : 128);
				
				stroke(192);
				strokeWeight(1 / VIEW.zoom);
				circle(room.center[0], room.center[1], 10 / VIEW.zoom);
			}
		}

		// Display selected points
		for (let i = 0; i < rows.length; i++) {
			const room = rooms.find(r => r.id == document.getElementById("point-" + (i + 1)).value);
			if (!room || !room.center || room.floor != _floor) continue;

			// Draw center, doors, etc.
			stroke(255);
			if (showOptions[`show-dev-tools`] && getElement("objectType").value == "Room" && devData.room == room) {
				stroke(0, 255, 0);
				noFill();
				(room.doors || []).forEach(d => {
					rect(d[0] - 2 / VIEW.zoom, d[1] - 2 / VIEW.zoom, 4 / VIEW.zoom, 4 / VIEW.zoom);
				});
				(room.vertices || []).forEach(v => {
					triangle(v[0], v[1] - 2 / VIEW.zoom, v[0] + 2 / VIEW.zoom, v[1] + 2 / VIEW.zoom, v[0] - 2 / VIEW.zoom, v[1] + 2 / VIEW.zoom);
				});
			}
			fill(0);
			strokeWeight(1 / VIEW.zoom);
			circle(room.center[0], room.center[1], 10 / VIEW.zoom);
			textAlign(CENTER, TOP);
			textSize(10 / VIEW.zoom);
			textStyle(BOLD);
			text(room.id, room.center[0], room.center[1] - 15 / VIEW.zoom);
		}

		// Iteration 2: Display tooltip if hovered
		for (let i = 0; i < rooms.length; i++) {
			var room = rooms[i];
			if (room.hover) {
				const tooltipW = 240 / VIEW.zoom, tooltipH = (128 + 12 * floor((room.notes || '').length / 35)) / VIEW.zoom;
				const tooltipX = room.center[0] - tooltipW / 2, tooltipY = room.center[1] + 10 / VIEW.zoom;
				fill(255, 255, 255, 192);
				stroke(0);
				rect(tooltipX, tooltipY, tooltipW, tooltipH, 5 / VIEW.zoom);
				fill(0);
				textAlign(LEFT, TOP);
				noStroke();
				textSize(10 / VIEW.zoom);
				textStyle(BOLD);
				text(`Name/ID
Purpose
Section
Floor`, tooltipX + 3 / VIEW.zoom, tooltipY + 3 / VIEW.zoom);
				text(`Coverage
Last updated

Contributors
Developer notes`, tooltipX + 3 / VIEW.zoom, tooltipY + 66 / VIEW.zoom);
				textStyle(NORMAL);
				text(`${room.id}
${room.use || "N/A"}
${room.section}
${room.floor}`, tooltipX + 50 / VIEW.zoom, tooltipY + 3 / VIEW.zoom, 205 / VIEW.zoom);
				text(`${["center", "doors", "vertices"].filter(p => room[p]).length}/3
${room.updated}
${room.authors.join(', ')}
${room.notes || "None"}`, tooltipX + 80 / VIEW.zoom, tooltipY + 66 / VIEW.zoom, 160 / VIEW.zoom);
			}
		}
	}

	// Draw an arrow centered at (x, y), facing in direction dir 
	function drawArrow(x, y, dir) {
		noFill();
		beginShape();
		vertex(x, y - 15 / VIEW.zoom * dir);
		vertex(x + 10 / VIEW.zoom, y - 5 / VIEW.zoom * dir);
		vertex(x + 5 / VIEW.zoom, y - 5 / VIEW.zoom * dir);
		vertex(x + 5 / VIEW.zoom, y + 5 / VIEW.zoom * dir);
		vertex(x - 5 / VIEW.zoom, y + 5 / VIEW.zoom * dir);
		vertex(x - 5 / VIEW.zoom, y - 5 / VIEW.zoom * dir);
		vertex(x - 10 / VIEW.zoom, y - 5 / VIEW.zoom * dir);
		vertex(x, y - 15 / VIEW.zoom * dir);
		endShape();
	}
	// Draw a dotted line from point a to b
	function drawDottedLine(a, b) {
		const len = dist(a[0], a[1], b[0], b[1]);
		for (let d = 0; d < len; d += 5 / VIEW.zoom) {
			point(
				a[0] + (b[0] - a[0]) * d / len,
				a[1] + (b[1] - a[1]) * d / len
			);
		}
	}

	// Nodes and Links (dev mode)
	if (showOptions[`show-dev-tools`]) {
		// Display dots for node selection
		// Display the node and detect hovering if applicable
		for (let i = 0, hovering = false; i < nodes.length; i++) {
			var node = nodes[i];
			if (node.floor == _floor && node.pos) {
				if (
					["selectNode", "setNodeA", "setNodeB"].includes(devData.awaiting) &&
					CURSOR.virtPos.dist(createVector(node.pos)) < 3 / VIEW.zoom &&
					!hovering
				) {
					node.hover = true;
					hovering = true;
					cursorType = HAND;
				} else node.hover = false;

				noFill();
				if (node.visited) fill(255, 0, 255);
				stroke(0);
				strokeWeight(1 / VIEW.zoom);
				circle(node.pos[0], node.pos[1], 10 / VIEW.zoom);

				fill(255);
				if (node.hover) fill(mouseIsPressed ? color(250, 85, 85) : 128);
				stroke(getElement("objectType").value == "Node" && node == devData.node ? color(0, 255, 0) : 192);
				circle(node.pos[0], node.pos[1], 6 / VIEW.zoom);
			}
		}

		// Display the link and detect hovering if applicable
		for (let i = 0, hovering = false; i < links.length; i++) {
			var link = links[i];
			const selectedLink = getElement("objectType").value == "Link" && link == devData.link;

			if (link.points[0] && link.points[1] && link.points.find(p => p[2] == _floor)) {
				const hoveringOnLine = link.points[0][2] == link.points[1][2] &&
					distToLine(CURSOR.virtPos, link.points[0], link.points[1]) < 3 / VIEW.zoom;
				const hoveringOnArrow = link.points[0][2] != link.points[1][2] &&
					link.points.find(p => CURSOR.virtPos.dist(createVector(p)) < 10 / VIEW.zoom);
				if (devData.awaiting == "selectLink" && (hoveringOnLine || hoveringOnArrow) && !hovering) {
					link.hover = true;
					hovering = true;
					cursorType = HAND;
				} else link.hover = false;

				stroke(0);
				if (link.visited) stroke(255, 0, 255);
				if (link.hover) stroke(mouseIsPressed ? color(250, 85, 85) : 128);
				if (selectedLink) stroke(0, 255, 0);
				strokeWeight(2 / VIEW.zoom);
				// The points are on the same floor
				if (link.points[0][2] == link.points[1][2]) {
					if (!link.tmp) line(link.points[0][0], link.points[0][1], link.points[1][0], link.points[1][1]);
					else drawDottedLine(link.points[0], link.points[1]);
				// The points are on different floors
				} else {
					link.points.forEach((p, i) => {
						if (p[2] == _floor) {
							const otherPoint = link.points[1 - i];
							drawArrow(p[0], p[1], otherPoint[2] - p[2]);
						}
					});
				}
			}

			if (selectedLink) {
				noStroke();
				fill(0, 255, 0);
				textSize(8 / VIEW.zoom);
				textAlign(CENTER, CENTER);
				link.points.forEach((p, i) => {
					if (p && p[2] == _floor) text('AB'[i], link.points[i][0], link.points[i][1]);
				});
			}
		}
	}

	// Draw route
	if (path && showOptions[`show-path`]) {
		stroke(0, 255, 255);
		strokeWeight(2 / VIEW.zoom);

		path.links.forEach((l, n) => {
			if (!l.points.find(p => p[2] == _floor)) return;

			// The points are on the same floor
			if (l.points[0][2] == l.points[1][2]) {
				if (!l.tmp) line(l.points[0][0], l.points[0][1], l.points[1][0], l.points[1][1]);
				else drawDottedLine(l.points[0], l.points[1]);
			// The points are on different floors
			} else {
				l.points.forEach((p, i) => {
					if (p[2] == _floor) {
						const otherPoint = l.points[1 - i];
						drawArrow(p[0], p[1], otherPoint[2] - p[2]);
					}
				});
			}

			fill(0);
			textSize(10 / VIEW.zoom);
			textAlign(CENTER, CENTER);
			textStyle(NORMAL);
			text(n + 1, (l.points[0][0] + l.points[1][0]) / 2, (l.points[0][1] + l.points[1][1]) / 2);
		});
	}

	pop();

	/*
		UI Controls
	*/
	textFont(`Roboto`);
	textSize(16);

	// Cursor
	cursor(cursorType);
	cursorType = ARROW;

	// Compass
	textAlign(CENTER, TOP);
	fill(0);
	textSize(30);
	const x = width - 30, y = height - 60;
	text(`N`, x + 5, y);
	triangle(x, y + 50, x + 5, y + 30, x + 10, y + 50);
};
