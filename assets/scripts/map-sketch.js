var canvas, images = {
	original: {floors: [], site: null},
	reduced: {floors: [], site: null}
};
const dimensions = [600, 600];
const assetPath = "";

function preload () {
	// Load maps
	["original", "reduced"].forEach(m => {
		for (let i = 1; i <= 4; i++) images[m].floors.push(loadImage(`${assetPath}/maps/${m}/f${i}-${m}.png`));
		images[m].site = loadImage(`${assetPath}/maps/${m}/site-${m}.png`);
	});
}

function inCanvas () {
	return mouseX > 0 && mouseX < dimensions[0] && mouseY > 0 && mouseY < dimensions[1];
}

// Display an array or array of arrays as coordinates
function dispCoords (coords) {
	if (coords == null) return "None";
	if (typeof coords[0] == "object") {
		var strs = coords.slice(0, 2).map(c => dispCoords(c));
		if (coords.length > 2) strs.push('+' + (coords.length - 2) + ' more');
		return strs.join(', ');
	} else return JSON.stringify(coords.map(c => round(c))).replace(/\[/g, '(').replace(/\]/g, ')').replace(/,/g, ', ');
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
	else link.vLen = constants.FEET_PER_FLOOR / constants.FEET_PER_PIXEL;
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

var setup = function () {
	canvas = createCanvas(dimensions[0], dimensions[1]);
	canvas.parent("processingCanvas");

	menus = [
		// Main menu
		new Menu({
			rows: [
				new Row({
					left: [
						new Label({ 
							txt: "(Drag to move)"
						}),
						new Button({
							title: "Center Map",
							onPress: () => { _camera.pos = [0, 0]; }
						})
					],
					right: [
						new CoverageIndicator({})
					]
				}),
				new Row({
					left: [
						new Checkbox({
							title: "Floor Plan",
							defState: true,
							id: "showFloor"
						}),
						new Checkbox({
							title: "Site Plan",
							id: "showSite"
						}),
						new Checkbox({
							title: "Show Points",
							defState: true,
							id: "showPoints"
						}),
						new Checkbox({
							title: "Show Path",
							defState: true,
							id: "showPath"
						}),
						new Checkbox({
							title: "Developer",
							id: "devMode"
						})
					]
				}),
				new Row({
					left: [
						new Scrollbar({
							title: "Floor",
							shift: 50,
							scrollW: 540,
							points: [1, 2, 3, 4],
							onChange: newVal => { _floor = newVal; }
						})
					]
				}),
				new Row({
					left: [
						new Scrollbar({
							title: "Zoom",
							shift: 50,
							scrollW: 540,
							points: [0.25, 0.35, 0.5, 0.65, 0.85, 1, 1.15, 1.3, 1.5, 1.75, 2, 2.3, 2.6, 3, 3.5, 4],
							defPoint: 2,
							onChange: newVal => { _camera.zoom = newVal; }
						})
					]
				}),
				new Row({
					left: [
						new Compass({
							m: 10
						}),
						new Ruler({
							m: 10,
							id: "ruler"
						}),
						new Label({
							txt: "Floor center: ${dispCoords(_camera.floorCenter)}\nCamera offset: ${dispCoords(_camera.pos.map(p => -p))}",
							sz: 8,
							m: 10
						}),
						new Label({
							txt: "Cursor position: ${dispCoords(_cursor.pos)}\nCursor coordinate: ${dispCoords(_cursor.coords)}",
							sz: 8,
							m: 10
						})
					],
					right: [
						new FPScounter({
							id: "FPS"
						})
					]
				})
			]
		}),
		// Dev menu
		new Menu({
			rows: [
				new Row({
					left: [
						new Label({
							txt: "${devData.msg.a > 0 ? devData.msg.txt : 'Developer Menu'}",
							id: "devMsg",
							run: () => {
								if (devData.msg.a > 0) {
									getElement("devMsg").col = color(devData.msg.r, devData.msg.g, devData.msg.b, devData.msg.a);
									//console.log(this.col)
									if (!devData.awaiting) devData.msg.a -= 300 / getElement("FPS").lastFrameRate;
								} else getElement("devMsg").col = color(0);
							}
						})
					],
					right: [
						new Button({
							title: "Cancel Action",
							onPress: () => {
								if (devData.awaiting) {
									devData.awaiting = null;
									devData.msg.a = 200;
								} else devData.pushMsg("No action to cancel", 0);
							}
						})
					]
				}),
				new Row({
					left: [
						new Selector({
							title: "Object Type",
							options: ["Room", "Node", "Link"],
							id: "objectType"
						})
					],
					right: [
						new Button({
							title: "Print Object",
							onPress: () => {
								var outputObj;
								switch (getElement("objectType").value) {
									case "Room":
										if (!devData.room) return devData.pushMsg("No room selected", 0);
										devData.room.updated = Date();
										//delete devData.room.hover;
										outputObj = devData.room;
										break;
									case "Node":
										if (!devData.node) return devData.pushMsg("No node selected", 0);
										//delete devData.node.hover;
										outputObj = devData.node;
										break;
									case "Link":
										if (!devData.link) return devData.pushMsg("No link selected", 0);
										/*
										delete devData.link.hover;
										delete devData.link.gLen;
										delete devData.link.vLen;
										*/
										outputObj = devData.link;
										//computeLength(devData.link);
										break;
									default:
										devData.pushMsg("No object type selected", 0);
								}

								if (outputObj) {
									document.getElementById("outputDiv").removeAttribute("hidden");
									document.getElementById("outputField").value = formatJSON(outputObj);
									devData.pushMsg("Object printed to webpage", 1);
								}
							}
						}),
						new Button({
							title: "Print All",
							onPress: () => {
								// Change rooms from flat array to organized list
								var formattedRoomsList = [];
								for (let f = 0; f < 4; f++) {
									var formattedFloor = {};
									rooms.forEach(r => {
										if (r.floor != f + 1) return;
										if (!formattedFloor[r.section]) formattedFloor[r.section] = [];
										delete r.hover;
										formattedFloor[r.section].push(r);
									});
									formattedRoomsList.push(formattedFloor);
								}
								// Remove runtime data from nodes and links
								clearCalc();
								nodes.forEach(n => {
									delete n.hover
								});
								links.forEach(l => {
									delete l.hover;
									delete l.gLen;
									delete l.vLen;
								});

								document.getElementById("outputDiv").removeAttribute("hidden");
								// Make sure all the nodes and links have the required fields
								document.getElementById("outputField").value = formatJSON({
									constants: constants,
									rooms: formattedRoomsList,
									nodes: nodes.filter(n => n.pos),
									links: links.filter(l => l.points[0] && l.points[1])
								});

								// Compute the lengths of links again so that the progam does not crash
								links.forEach(l => computeLength(l));

								devData.pushMsg("Data printed to webpage", 1);
							}
						})
					]
				}),
				// Room editing
				new Row({
					left: [
						new Button({
							title: "Select",
							onPress: () => {
								if (!rows.length) return devData.pushMsg("First row does not exist", 0);
								if (document.getElementById("point1").style["background-color"] != "lightgreen") return devData.pushMsg("Invalid point entered", 0);

								devData.room = rooms.find(r => r.id == document.getElementById("point1").value);
								devData.pushMsg("Selected room", 1);
							}
						}),
						new Button({
							title: "Deselect",
							onPress: () => {
								if (!devData.room) return devData.pushMsg("No room selected", 0);
								devData.room = null;
							}
						}),
						new Selector({
							title: "Attribute",
							options: ["Center", "Doors", "Vertices"],
							id: "attr"
						}),
						new Button({
							title: "Undo",
							onPress: () => {
								const attr = getElement("attr").value;
								if (!devData.room) return devData.pushMsg("No room selected", 0);
								if (!attr) return devData.pushMsg("No attribute selected", 0);
								
								switch (attr) {
									case "Center":
										if (!devData.room.center) devData.pushMsg("No action to undo", 0);
										else devData.room.center = null;
										break;
									case "Doors":
										if (!devData.room.doors) devData.pushMsg("No action to undo", 0);
										else {
											devData.room.doors.splice(devData.room.doors.length - 1, 1);
											if (!devData.room.doors.length) devData.room.doors = null;
										}
										break;
									case "Vertices":
										if (!devData.room.vertices) devData.pushMsg("No action to undo", 0);
										else {
											devData.room.vertices.splice(devData.room.vertices.length - 1, 1);
											if (!devData.room.vertices.length) devData.room.vertices = null;
										}
										break;
								}
							}
						})
					],
					checkDisplay: () => getElement("objectType").value == "Room"
				}),
				new Row({
					left: [
						new Label({
							txt: "Name/ID: ${devData.room.id}"
						}),
						new Label({
							txt: "Center: ${dispCoords(devData.room.center)}"
						}),
						new Label({
							txt: "Floor: ${devData.room.floor}"
						})
					],
					checkDisplay: () => getElement("objectType").value == "Room" && devData.room
				}),
				new Row({
					left: [
						new Label({
							txt: "Doors: ${dispCoords(devData.room.doors)}"
						}),
						new Label({
							txt: "Vertices: ${dispCoords(devData.room.vertices)}"
						})
					],
					checkDisplay: () => getElement("objectType").value == "Room" && devData.room
				}),
				// Node editing
				new Row({
					left: [
						new Button({
							title: "Select",
							onPress: () => {
								devData.awaiting = "selectNode";
								devData.pushMsg("Click a node to select it...", 2);
							}
						}),
						new Button({
							title: "Deselect",
							onPress: () => {
								if (!devData.node) return devData.pushMsg("No node selected", 0);
								devData.awaiting = null;
								devData.node = null;
							}
						}),
						new Button({
							title: "Create",
							onPress: () => {
								nodes.push({
									floor: _floor,
									links: [],
									id: ~~(random(1000000))
								});
								devData.node = nodes[nodes.length - 1];
								devData.pushMsg("Created and selected node", 1);
							}
						}),
						new Button({
							title: "Position",
							onPress: () => {
								if (!devData.node) return devData.pushMsg("No node selected", 0);
								devData.awaiting = "moveNode";
								devData.pushMsg("Choose the node's new location...", 2);
							}
						}),
						new Button({
							title: "Merge Links",
							onPress: () => {
								if (!devData.node) return devData.pushMsg("No node selected", 0);
								if (devData.node.links.length != 2) return devData.pushMsg("Two links needed", 0);
								mergeLinks(devData.node.id);
								devData.pushMsg("Merged links", 1);
							}
						}),
						new Button({
							title: "Delete",
							onPress: () => {
								if (!devData.node) return devData.pushMsg("No node selected", 0);
								deleteNode(devData.node.id);
								devData.pushMsg("Deleted node", 1);
							}
						})
					],
					checkDisplay: () => getElement("objectType").value == "Node"
				}),
				new Row({
					left: [
						new Label({
							txt: "Position: ${dispCoords(devData.node.pos)}"
						}),
						new Label({
							txt: "Floor: ${devData.node.floor}"
						}),
						new Label({
							txt: "Links: (${devData.node.links.length})"
						}),
						new Label({
							txt: "Temporary: ${devData.node.tmp ? 'Yes' : 'No'}"
						}),
						new Label({
							txt: "ID: #${devData.node.id}"
						})
					],
					checkDisplay: () => getElement("objectType").value == "Node" && devData.node
				}),
				// Link editing
				new Row({
					left: [
						new Button({
							title: "Select",
							onPress: () => {
								devData.awaiting = "selectLink";
								devData.pushMsg("Click a link to select it...", 2);
							}
						}),
						new Button({
							title: "Deselect",
							onPress: () => {
								if (!devData.link) return devData.pushMsg("No link selected", 0);
								devData.awaiting = null;
								devData.link = null;
							}
						}),
						new Button({
							title: "Create",
							onPress: () => {
								links.push({
									points: [null, null],
									nodes: [null, null],
									id: ~~(random(1000000))
								});
								devData.link = links[links.length - 1];
								computeLength(devData.link);
								devData.pushMsg("Created and selected link", 1);
							}
						}),
						new Button({
							title: "Set Node A",
							onPress: () => {
								if (!devData.link) return devData.pushMsg("No link selected", 0);
								devData.awaiting = "setNodeA";
								devData.pushMsg("Click the node to set as node A...", 2);
							}
						}),
						new Button({
							title: "Set Node B",
							onPress: () => {
								if (!devData.link) return devData.pushMsg("No link selected", 0);
								devData.awaiting = "setNodeB";
								devData.pushMsg("Click the node to set as node B...", 2);
							}
						}),
						new Button({
							title: "Split",
							onPress: () => {
								if (!devData.link) return devData.pushMsg("No link selected", 0);
								devData.awaiting = "splitLink";
								devData.pushMsg("Click on the split point...", 2);
							}
						}),
						new Button({
							title: "Delete",
							onPress: () => {
								if (!devData.link) return devData.pushMsg("No link selected", 0);
								deleteLink(devData.link.id);
								devData.pushMsg("Deleted link", 1);
							}
						})
					],
					checkDisplay: () => getElement("objectType").value == "Link"
				}),
				new Row({
					left: [
						new Label({
							txt: "Name: ${devData.link.name || 'None'}"
						}),
						new Label({
							txt: "Node A: ${devData.link.nodes[0] ? '#' + devData.link.nodes[0] + ' ' + dispCoords(devData.link.points[0]) : 'None'}"
						}),
						new Label({
							txt: "Node B: ${devData.link.nodes[1] ? '#' + devData.link.nodes[1] + ' ' + dispCoords(devData.link.points[1]) : 'None'}"
						})
					],
					checkDisplay: () => getElement("objectType").value == "Link" && devData.link
				}),
				new Row({
					left: [
						new Label({
							txt: "Ground Length: ${devData.link.gLen.toFixed(2)} px"
						}),
						new Label({
							txt: "Vertical Length: ${devData.link.vLen.toFixed(2)} px"
						}),
						new Label({
							txt: "Temporary: ${devData.link.tmp ? 'Yes' : 'No'}"
						}),
						new Label({
							txt: "ID: #${devData.link.id}"
						})
					],
					checkDisplay: () => getElement("objectType").value == "Link" && devData.link
				})
			],
			checkDisplay: () => getElement("devMode").on
		})
	]
	ruler = getElement("ruler");
};

/*
	Navigation
*/
var _floor = 1;
const mapDimensions = [1083, 500];
const siteDimensions = [2263, 1267], sitePlanOffest = [-525, -248];
var _camera = {
	//center: [1083 / 2, 500 / 2],
	dispCenter: [mapDimensions[0] / 4, mapDimensions[1] / 4], // initial center of map display; does not change
	floorCenter: [0, 0], // Position of floor plan's center
	pos: [0, 0],//mapDimensions.map(d => d / 2),
	zoom: 0.5
}, _cursor = {
	pos: [0, 0], // Location of mouse
	coords: [0, 0]// Projected mouse position (the coordinate on the floor's image that the mouse is over)
};

var ruler;

// What the cursor is displayed as (changes between ARROW, HAND, and MOVE)
var cursorType;

// 1083, 500
var mouseDragged = function () {
	if (Interactive.active || (mouseX < 0 || mouseX > 600 || mouseY < 0 || mouseY > 600)) return;

	cursorType = MOVE;
	for (let i = 0; i <= 1; i++) {
		_camera.pos[i] += ([mouseX, mouseY][i] - [pmouseX, pmouseY][i]) / (_camera.zoom * (getElement("FPS").optimize ? 2 : 1));
	}
};

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
	UI Menu Objects
*/
function Element (args) {
	/*
		Arguments
		number x: X-position of upper left corner
		number shift*: Distance to translate from left x position to compute shiftX (default 0)
		number y: Y-position of upper left corner
		number w*: Width of element, defaults to 0 (the element does not show at all if width is 0)
		number m*: Horizontal margin width of element (added to the right of left-aligned elements, left of right-aligned elements), defaults to 20
		string id*: Optional identifier to reference the element by
		() => void run*: Code that the element runs every frame to perform additional functions, if needed
	*/
	this.args = args;
	this.x = args.x;
	this.shift = args.shift || 0;
	this.shiftX = this.x + this.shift;
	this.y = args.y;
	this.w = args.w || 0;
	this.m = args.m || 20;
	this.id = args.id;
	this.run = args.run || (() => {});
}

function Label (args) {
	/*
		Inherits Element()

		Arguments
		string txt: Text to display (can be a template literal, ex. "1 + 2 = ${1 + 2}" will display "1 + 2 = 3")
		color col*: Color (defaults to black)
		number sz*: Font size (defaults to 16)
		string vAlign*: Vertical alignment (defaults to "center")
	*/
	Element.call(this, args);
	this.txt = args.txt;
	this.col = args.col || color(0);
	this.sz = args.sz || 16;
	this.vAlign = args.vAlign || CENTER;
	
	this.draw = function () {
		fill(this.col);
		textSize(this.sz);
		textAlign(LEFT, this.vAlign);
		const evaledTxt = eval('`' + this.txt + '`');
		text(evaledTxt, this.x, this.y + 10);
		this.w = Math.max(... evaledTxt.split('\n').map(l => textWidth(l)));
	};
}

function Compass (args) {
	/*
		Inherits Element()
	*/
	Element.call(this, args);

	this.draw = function () {
		textAlign(CENTER, TOP);
		fill(0);
		textSize(10);
		triangle(this.x, this.y + 20, this.x + 3, this.y + 10, this.x + 6, this.y + 20);
		text(`N`, this.x + 3, this.y);
		this.w = 6;
	};
}

function Interactive (args) {
	/*
		Inherits Element()

		Arguments
		[shiftX, shiftY, w, h] intBounds*: If given, the interactive region (where hovering and clicks are registered) will be shifted by (<shiftX>, <shiftY>) and have dimensions of <w> by <h>; if not, the interactive region will be assigned as the entire element
		() => void onPress*: If given, this function will be run when the mouse is clicked
		() => void onRelease*: If given, this function will be run when the mouse is released
	*/
	Element.call(this, args);
	this.autoBound = true;
	this.intBounds = args.intBounds || [0, 0, this.w, 20];
	this.onPress = args.onPress || (() => {});
	this.onRelease = args.onRelease || (() => {});
	this.hover = false;
	this.active = false;

	Interactive.active = Interactive.active || false;

	this.checkHover = function () {
		if (!args.intBounds && this.autoBound) this.intBounds[2] = this.w;
		if (mouseX > this.x + this.intBounds[0] && mouseX < this.x + this.intBounds[0] + this.intBounds[2] && mouseY > this.y + this.intBounds[1] && mouseY < this.y + this.intBounds[1] + this.intBounds[3]) {
			if (!Interactive.active) this.hover = this.active = Interactive.active = true;
		} else {
			if (this.active) Interactive.active = false;
			this.hover = this.active = false;
		}
		if (this.active) cursorType = HAND;
	};

	this.checkPress = function () {
		if (this.active) this.onPress();
	}

	this.checkRelease = function () {
		if (this.active) {
			this.onRelease();
			this.active = Interactive.active = false;
		}
	}
}

function Scrollbar (args) {
	/*
		Inherits Interactive()

		Arguments
		string title*: The title of the scrollbar, if necessary
		number shift*: How many pixels to the right of the element's left border the scrollbar should start at (defaults to 0)
		number scrollW: Width of scrollbar
		any[] points: The points on the scrollbar
		number defPoint*: The index of the default point in the `points` argument, 0 if not given
		(any newVal) => void onChange: A function that is called when the value changes
	*/
	Interactive.call(this, args);
	this.title = args.title;
	this.scrollW = args.scrollW;
	this.w = this.shift + this.scrollW;
	this.intBounds = [this.shift, 0, this.scrollW, 20]; // Changes Interactive() property
	this.thumbW = args.scrollW / args.points.length;
	this.points = args.points.map((p, i) => [p, (i + 1/2) * this.thumbW]);
	this.index = args.defPoint || 0;
	this.scroll = this.index * this.thumbW;
	this.inBar = false;
	this.selectShift = null; // Stores x position of the mouse relative to the start of the scrollbar when the bar is selected
	this.onChange = args.onChange;

	this.draw = function () {
		textAlign(LEFT, CENTER);
		fill(0);
		noStroke();
		textSize(16);
		text(this.title, this.x, this.y + 10);

		fill(255);
		stroke(0);
		rect(this.shiftX, this.y, this.scrollW, 20);

		fill(0);
		textAlign(CENTER, CENTER);
		fill(223);
		if (this.inBar) fill(192);
		if (this.selectShift) fill(128);
		noStroke();
		rect(this.shiftX + this.scroll, this.y, this.thumbW, 20);

		for (let i = 0; i < this.points.length; i++) {
			fill((i == this.index ? 255 : 0), 0, 0);
			text(this.points[i][0], this.shiftX + this.points[i][1], this.y + 12);
		}
		fill(0);
		textAlign(LEFT, TOP);
	};

	this.interact = function () {
		this.inBar = mouseX > this.shiftX + this.scroll && mouseX < this.shiftX + this.scroll + this.thumbW && mouseY > this.y && mouseY < this.y + 20;

		// The thumb is being controlled, move it along
		if (this.selectShift) {
			this.scroll = constrain(mouseX - this.shiftX - this.selectShift, 0, this.scrollW - this.thumbW);
			this.active = Interactive.active = true;
		}

		// Find the closest element to the center of the thumb
		var closest = [Infinity, 0];
		for (let i = 0; i < this.points.length; i++) {
			const pointDist = Math.abs(this.points[i][1] - (this.scroll + this.thumbW / 2));
			if (pointDist < closest[0]) closest = [pointDist, i];
		}
		// Register a change in value
		if (this.index != closest[1]) {
			this.index = closest[1];
			this.onChange(this.points[this.index][0]);
		}
	};

	this.onPress = function () {
		// If the user clicks on the thumb (selects)
		if (this.inBar) this.selectShift = mouseX - (this.shiftX + this.scroll);
		// If the user clicks a point on the scrollbar but not on the thumb
		else this.scroll = constrain((mouseX - this.shiftX) - this.thumbW / 2, 0, this.scrollW - this.thumbW);
	}

	this.onRelease = function () {
		// If the scrollbar was previously selected, release the bar
		if (this.selectShift) this.selectShift = null;
	}
}

function Checkbox (args) {
	/*
		Inherits Interactive()

		Arguments
		string title: The title of the checkbox
		boolean defState*: The state the checkbox is in by default (off if not provided)

		Properties
		boolean on: Whether the checkbox is on
	*/
	Interactive.call(this, args);
	this.title = args.title;
	this.on = args.defState;
	this.autoBound = false;
	this.intBounds[2] = 20;
	this.shift = 30;

	this.draw = function () {
		fill(this.on ? color(64, 64, 255) : color(223));
		rect(this.x, this.y, 20, 20, 5);
		stroke(223);
		strokeWeight(2);
		line(this.x + 4, this.y + 10, this.x + 8, this.y + 14);
		line(this.x + 8, this.y + 14, this.x + 16, this.y + 6);
		strokeWeight(1);
		if (this.hover) {
			noStroke();
			fill(0, 0, 0, 64);
			rect(this.x, this.y, 20, 20, 5);
		}

		textAlign(LEFT, CENTER);
		fill(0);
		textSize(16);
		noStroke();
		text(this.title, this.shiftX, this.y + 10);
		this.w = 30 + textWidth(this.title);
	};

	this.onPress = function () {
		this.on = !this.on;
	};
}

function Button (args) {
	/*
		Inherits Interactive()

		Arguments
		string title: The title of the button
		() => void onPress^: A function that runs when the button is clicked
	*/
	Interactive.call(this, args);
	this.title = args.title;

	this.draw = function () {
		textSize(16);
		this.w = textWidth(this.title) + 8;

		noStroke();
		fill(223);
		if (this.hover) fill(mouseIsPressed ? 128 : 192);
		rect(this.x, this.y, this.w, 20, 5);

		fill(0);
		textAlign(LEFT, CENTER);
		text(this.title, this.x + 4, this.y + 10);

		textAlign(LEFT);
	};
}

function Selector (args) {
	/*
		Inherits Interactive()

		Arguments
		string title*: The title of the selector, if necessary
		any[] options: The options that can be selected
		number defOption*: The index of the default option, null by default

		Properties
		any value: The value currently selected
	*/
	Interactive.call(this, args);
	this.title = args.title || '';
	this.options = args.options;
	this.index = args.defOption || null;
	this.hoverIndex = null;
	this.value = this.index ? this.options[this.index] : null;
	this.autoBound = false;

	this.draw = function () {
		textAlign(LEFT, CENTER);
		fill(0);
		noStroke();
		textSize(16);
		text(this.title, this.x, this.y + 10);

		var optionStart = this.title ? textWidth(this.title) + 10 : 0, optionShift = optionStart;
		for (let i = 0; i < this.options.length; i++) {
			const optionW = textWidth(this.options[i]) + 8, leftCorner = i == 0 ? 5 : 0, rightCorner = i == this.options.length - 1 ? 5 : 0;
			fill(223);
			if(i == this.hoverIndex) fill(192);
			if (i == this.index) fill(128);
			rect(this.x + optionShift, this.y, optionW, 20, leftCorner, rightCorner, rightCorner, leftCorner);
			if (i) {
				noStroke();
				fill(255);
				rect(this.x + optionShift, this.y, 1, 20)
			}
			fill(0);
			text(this.options[i], this.x + optionShift + 4, this.y + 10);
			optionShift += optionW + 1;
		}

		this.w = optionShift;
		this.intBounds = [optionStart, 0, this.w - optionStart, 20];
	};

	this.interact = function () {
		textSize(16);
		var optionX = this.x + (this.title ? textWidth(this.title) + 10 : 0);
		this.hoverIndex = null;
		for (let i = 0; i < this.options.length; i++) {
			const optionW = textWidth(this.options[i]) + 8;
			if (mouseX > optionX && mouseX < optionX + optionW && mouseY > this.y && mouseY < this.y + 20) this.hoverIndex = i;
			optionX += optionW + 1;
		}
	};

	this.onPress = function () {
		this.index = this.hoverIndex;
		this.value = this.options[this.index];
	}
}

function CoverageIndicator (args) {
	/*
		Inherits Interactive()

		Arguments
		number barW*: The width of the interactive bar (defaults to 200) 
	*/
	Interactive.call(this, args);
	this.shift = 115;
	this.barW = args.barW || 200;
	this.intBounds = [this.shift, 0, this.barW, 20];
	this.w = this.shift + this.barW;
	this.chunks = [
		{ name: "Fully Registered", color: color(0, 192, 0), description: "These rooms have all data fully registered into the index.", lines: 2, count: 0 },
		{ name: "Mostly Registered", color: color(255, 255, 0), description: "These rooms are marked and have both their centers and doors entered, but not their boundaries. They can be used for route calculation.", lines: 5, count: 0 },
		{ name: "Partially Registered", color: color(255, 0, 0), description: "These rooms are marked and also have their centers entered, meaning they can be selected on the map.", lines: 4, count: 0 },
		{ name: "Marked", color: color(128), description: "These rooms only have their names, uses (if applicable), sections, and floors registered. They can be searched but have no graphical representation.", lines: 5, count: 0 },
		{ name: "Unmarked", color: color(0), description: "It is estimated that this many rooms are completely missing from the database. It is unlikely that they will ever be added without volunteer help, because they are very difficult to identify from a surface level.", lines: 7, count: 47 }
	];
	for (let i = 0; i < rooms.length; i++) {
		if (rooms[i].vertices) this.chunks[0].count++;
		else if (rooms[i].doors) this.chunks[1].count++;
		else if (rooms[i].center) this.chunks[2].count++;
		else this.chunks[3].count++;
	}
	this.total = this.chunks.reduce((acc, cur) => acc + cur.count, 0);

	this.draw = function () {
		textAlign(LEFT, CENTER);
		text("Room Coverage", this.x, this.y + 10);
		fill(64);
		rect(this.shiftX, this.y, this.barW, 20);
		for (let i = 0, x = this.shiftX; i < this.chunks.length; i++) {
			const w = this.chunks[i].count / this.total * this.barW;
			fill(this.chunks[i].color);
			noStroke();
			rect(x, this.y, w, 20);
			x += w;
		}
	};

	this.interact = function () {
		textAlign(LEFT, CENTER);
		for (let i = 0, x = this.shiftX; i < this.chunks.length; i++) {
			const w = this.chunks[i].count / this.total * this.barW;
			if (mouseX > x && mouseX < x + w && mouseY > this.y && mouseY < this.y + 20) {
				noStroke();
				fill(255, 255, 255, 128);
				rect(x, this.y, w, 20);
				const infoX = Math.min(x + w / 2 - 75, width - 155), infoY = (this.y - 25) - this.chunks[i].lines * 12;
				fill(255, 255, 255, 192);
				stroke(0);
				rect(infoX, infoY, 150, this.chunks[i].lines * 12 + 20, 5);
				fill(0);
				textSize(10);
				noStroke();
				textAlign(LEFT, TOP);
				textStyle(BOLD);
				text(this.chunks[i].name, infoX + 5, infoY + 5);
				textStyle(NORMAL);
				text(this.chunks[i].description, infoX + 5, infoY + 17, 140);
				textAlign(RIGHT);
				text(this.chunks[i].count + '/' + this.total, infoX + 145, infoY + 5);
			}
			x += w;
		}
	};
}

function Ruler (args) {
	/*
		Inherits Interactive()

		Properties
		boolean on: Whether the ruler is on
	*/
	Interactive.call(this, args);
	this.w = 60;
	this.intBounds = [0, 8, this.w, 4];
	this.autoBound = false;
	this.on = false;
	this.points = [];

	this.draw = function () {
		textAlign(LEFT, TOP);
		textSize(8);
		var bottomText = '';
		if (this.on) {
			if (this.points.length) {
				var totalDist = 0;
				for (let i = 0; i < this.points.length - 1; i++) {
					totalDist += dist(this.points[i][0], this.points[i][1], this.points[i + 1][0], this.points[i + 1][1]) * constants.FEET_PER_PIXEL;
				}
				bottomText = `${totalDist.toFixed(1)} ft / ${(totalDist * 0.3048).toFixed(1)} m`;
				bottomTextW = textWidth(bottomText);
			} else bottomText = "Click on the map...";
			text(bottomText, this.x, this.y + 12);
			fill(250, 85, 85);
		}
		rect(this.x, this.y + 8, 60, 4);
		if (this.hover) {
			fill(255, 255, 255, 128);
			rect(this.x, this.y + 8, 60, 4);
		}
		fill(0);
		text(`60 px ~ ${(60 * constants.FEET_PER_PIXEL / _camera.zoom).toFixed(2)} ft`, this.x, this.y);
		this.w = max(60, textWidth(bottomText));
	};

	this.onPress = function () {
		if (!this.active) Interactive.active = true;
		else this.points = [];
		this.on = !this.on;
	}
}

function FPScounter (args) {
	/*
		Inherits Interactive()

		Properties
		number lastFrameRate: The last frame rate recorded by the counter
		boolean optimize: Whether the program is being optimized
	*/
	Interactive.call(this, args);
	this.lastFrameRate = 60;
	this.lastUpdate = 0;
	this.framesSinceUpdate = 0;
	this.stableUpdates = 5; // Counts the number of consecutive FPS updates that are stable (FPS varies by ≤ 1)
	this.shift = 18;
	this.w = 38;
	this.intBounds = [18, 0, 20, 20];
	this.autoBound = false;
	this.optimize = false;
	this.autoOptimized = false;

	this.draw = function () {
		textAlign(CENTER, CENTER);
		textSize(8);
		text("FPS", this.x + 8, this.y + 5);
		if (this.autoOptimized) fill(0, 0, 255);
		else if (this.optimize) fill(0, 128, 0);
		else {
			if (this.lastFrameRate >= 60) fill(0, 255, 0);
			else if (this.lastFrameRate >= 24) fill(255, 255, 0);
			else {
				fill(255, 0, 0);
				if (this.lastFrameRate < 12) stroke(255);
			}
		}
		rect(this.x, this.y + 10, 16, 10);
		fill(this.lastFrameRate >= 24 && !this.optimize ? 0 : 255);
		textAlign(CENTER, CENTER);
		text(round(this.lastFrameRate), this.x + 8, this.y + 15);
		
		// Leaf
		fill(this.optimize ? color(0, 128, 0) : color(255, 255, 255, 0));
		if (this.autoOptimized) fill(0, 0, 255);
		rect(this.shiftX, this.y, 20, 20);
		stroke(this.optimize ? color(255) : color(0, 128, 0));
		noFill();
		beginShape();
		curveVertex(this.shiftX + 10, this.y + 3);
		curveVertex(this.shiftX + 10, this.y + 3);
		curveVertex(this.shiftX + 7, this.y + 7);
		curveVertex(this.shiftX + 7, this.y + 11);
		curveVertex(this.shiftX + 10, this.y + 15);
		curveVertex(this.shiftX + 10, this.y + 15);
		endShape();
		beginShape();
		curveVertex(this.shiftX + 10, this.y + 3);
		curveVertex(this.shiftX + 10, this.y + 3);
		curveVertex(this.shiftX + 13, this.y + 7);
		curveVertex(this.shiftX + 13, this.y + 11);
		curveVertex(this.shiftX + 10, this.y + 15);
		curveVertex(this.shiftX + 10, this.y + 15);
		endShape();
		line(this.shiftX + 10, this.y + 9, this.shiftX + 10, this.y + 17);
		noStroke();
		if (this.hover) {
			fill(0, 0, 0, 64);
			rect(this.shiftX, this.y, 20, 20);
		}
		/*
		if (lastFrameRate < 24 && getElement("showSite").on) {
			fill(255, 0, 0);
			if (lastFrameRate < 15) stroke(255, 0, 0);
			text(`[!] The frame rate is low; you may want to turn off the site overlay to improve performance.`, 390, 575, 210);
		}
		*/
	};

	this.run = function () {
		this.framesSinceUpdate++;
		if (millis() - this.lastUpdate >= 1000) {
			if (abs(this.framesSinceUpdate - this.lastFrameRate) <= 1) this.stableUpdates++;
			else this.stableUpdates = 0;
			this.lastFrameRate = this.framesSinceUpdate;
			this.lastUpdate = millis();
			this.framesSinceUpdate = 0;
		}
		if (this.lastFrameRate < 12 && !this.optimize && millis() > 5000) {
			this.optimize = this.autoOptimized = true;
		}
		if (this.lastFrameRate >= 20 && this.stableUpdates >= 5 && this.autoOptimized) {
			this.optimize = this.autoOptimized = false;
		}
	};

	this.onPress = function () {
		this.optimize = !this.optimize;
		this.autoOptimized = false;
	}
}

function Container (args) {
	/*
		Arguments
		() => boolean checkDisplay*: A function that returns whether the container should be displayed at a certain time (by default, always returns true)
	*/
	this.elements = [];
	this.display = true;
	this.checkDisplay = args.checkDisplay || (() => true);
	this.y = height;
	this.h = 0;
}
function Row (args) {
	/*
		Inherits Container()

		Arguments
		Element[] left*: Elements to align starting from the left (empty by default)
		Element[] right*: Elements to align starting from the right (empty by default)
	*/
	Container.call(this, args);
	this.left = args.left || [];
	this.right = args.right || [];
	this.array = [this.left, this.right];
	this.elements = this.array.flat();
	this.h = 30;
	this.margin = 5;

	this.draw = function () {
		this.display = this.checkDisplay();
		if (!this.display) return;
		for (let s = 0; s < 2; s++) {
			if (!this.array[s].length) continue;
			// Either the left (s = 0) or right (s = 1) baseline for x-alignment
			var x = s ? width + this.array[s][0].m - this.margin : this.margin;
			this.array[s].forEach(e => {
				e.run();

				e.y = this.y + 5;
				// Subtract width before drawing (right)
				if (s) x -= e.w + e.m;
				e.x = x;
				e.shiftX = x + e.shift;
				e.draw();
				// Add width after drawing (left)
				if (!s) x += e.w + e.m;
			});
		}
	}

	this.interact = function () {
		if (!this.display) return;
		this.elements.forEach(e => {
			if (Interactive.active && !e.active) return;
			if (e.intBounds) {
				e.checkHover();
				if (e.interact) e.interact();
			}
		});
	};
}

var menus = [];
function Menu (args) {
	/*
		Inherits Container()

		Arguments
		Row[] rows: The rows of elements this menu contains, from top to bottom
	*/
	Container.call(this, args);
	this.rows = args.rows;
	args.rows.forEach(r => {
		this.elements = this.elements.concat(r.elements);
	});
	this.h = 0;

	this.draw = function () {
		this.h = 0;
		this.display = this.checkDisplay();
		if (!this.display) return;
		this.rows.forEach(r => {
			if (r.display) this.h += 30;
		});
		noStroke();
		fill(255, 255, 255, 192);
		rect(0, this.y, width, this.h);
		for (let r = 0, y = this.y; r < this.rows.length; r++) {
			this.rows[r].y = y;
			this.rows[r].draw();
			if (this.rows[r].display) y += 30;
		}
		stroke(0);
		line(0, this.y, width, this.y);
	};

	this.interact = function () {
		if (!this.display) return;
		this.rows.forEach(r => r.interact());
	}
}

function getElement (id) {
	var match;
	menus.forEach(m => {
		m.elements.forEach(e => {
			if (e.id == id) match = e;
		});
	});
	return match;
}

var mousePressed = function () {
	// Interact with menus
	menus.forEach(m => {
		if (!m.display) return;
		m.elements.forEach(e => {
			if (e.intBounds) e.checkPress();
		});
	});
	if (Interactive.active) return;

	// Ruler
	if (ruler.on) {
		if (mouseButton == LEFT) ruler.points.push(_cursor.coords);
		else {
			for (let i = 0; i < ruler.points.length; i++) {
				if (dist(ruler.points[i][0], ruler.points[i][1], _cursor.coords[0], _cursor.coords[1]) < 5 / _camera.zoom) {
					ruler.points.splice(i, 1);
					break;
				}
			}
		}
		return;
	}

	// Dev Tools
	if (getElement("devMode").on && getElement("objectType").value) {
		switch (getElement("objectType").value) {
			case "Room":
				switch (getElement("attr").value) {
					case "Center":
						devData.room.center = _cursor.coords;
						break;
					case "Doors":
						if (!devData.room.doors) devData.room.doors = [];
						devData.room.doors.push(_cursor.coords);
						break;
					case "Vertices":
						if (!devData.room.vertices) devData.room.vertices = [];
						devData.room.vertices.push(_cursor.coords);
						break;
				}
				break;
			case "Node":
				switch (devData.awaiting) {
					case "selectNode":
						nodes.forEach(n => {
							if (n.hover) {
								devData.node = n;
								devData.pushMsg("Selected node", 1);
							}
						});
						break;
					case "moveNode":
						devData.node.pos = _cursor.coords;
						links.forEach(l => {
							if (l.nodes.includes(devData.node.id)) {
								for (let i = 0; i <= 1; i++) {
									if (l.nodes[i] == devData.node.id) {
										l.points[i] = devData.node.pos.concat([devData.node.floor]);
									}
								}
								computeLength(l);
							}
						});
						devData.pushMsg("Positioned node", 1);
						break;
				}
				break;
			case "Link":
				switch (devData.awaiting) {
					case "selectLink":
						links.forEach(l => {
							if (l.hover) {
								devData.link = l;
								devData.pushMsg("Selected link", 1);
							}
						});
						break;
					case "setNodeA":
						nodes.forEach(n => {
							if (n.hover) {
								// Remove this link from the list of links in the node it was previous attached to, if applicable
								if (devData.link.nodes[0]) {
									var currentNodeA = nodes.find(i => i.id == devData.link.nodes[0]);
									var currentLinkIdx = currentNodeA.links.indexOf(devData.link.id);
									currentNodeA.links.splice(currentLinkIdx, 1);
								}
								n.links.push(devData.link.id);

								devData.link.points[0] = n.pos.concat([n.floor]);
								devData.link.nodes[0] = n.id;
								
								computeLength(devData.link);
								devData.pushMsg("Set node A", 1);
							}
						});
						break;
					case "setNodeB":
						nodes.forEach(n => {
							if (n.hover) {
								// Remove this link from the list of links in the node it was previous attached to, if applicable
								if (devData.link.nodes[1]) {
									var currentNodeB = nodes.find(i => i.id == devData.link.nodes[1]);
									var currentLinkIdx = currentNodeB.links.indexOf(devData.link.id);
									currentNodeB.links.splice(currentLinkIdx, 1);
								}
								n.links.push(devData.link.id);

								devData.link.points[1] = n.pos.concat([n.floor]);
								devData.link.nodes[1] = n.id;
								
								computeLength(devData.link);
								devData.pushMsg("Set node B", 1);
							}
						});
						break;
					case "splitLink":
						splitLink(devData.link.id, _cursor.coords, _floor);
						devData.pushMsg("Split link", 1);
						break;
				}
				break;
		}
	} else {
		rooms.forEach(r => {
			if (r.hover) {
				// Add room
				if (mouseButton == LEFT) {
					// Handle edge case where there are no rows to begin with
					if (!rows.length) addPoint();
					// Find the number of the first empty point input
					var i = 1, input;
					for ( ; i <= rows.length; i++) {
						input = document.getElementById("point" + i);
						if (!input.value) break;
					}
					// If we are at the last row and it is still full, create a new row and go to that one
					if (input.value && i == rows.length + 1) {
						addPoint();
						input = document.getElementById("point" + i);
					}
					// Assign the name of the room and the "valid" color to the input
					input.value = r.id;
					input.style["background-color"] = "lightgreen";
				} else {
					// Remove room
					for (let i = 1; i <= rows.length; i++) {
						input = document.getElementById("point" + i);
						if (input.value == r.id) {
							removePoint(i);
							break;
						}
					}
				}
			}
		});
	}
};

var mouseReleased = function () {
	menus.forEach(m => {
		if (!m.display) return;
		m.elements.forEach(e => {
			if (e.intBounds) e.checkRelease();
		});
	});
};

/*
	Driver Function
*/
var draw = function () {
	// Remove loading message
	if (!loaded) {
		document.getElementById("pjsLoadingMessage").innerHTML = '';
		loaded = true;
	}

	background(255);
	const opt = getElement("FPS").optimize;
	frameRate(opt ? 24 : 60);

	/*
		Map Display
	*/

	push();
	
	// initial centering
	translate(_camera.dispCenter[0], _camera.dispCenter[1]);

	// transformations
	scale(_camera.zoom);
	translate(_camera.pos[0] - mapDimensions[0] / 2, _camera.pos[1] - mapDimensions[1] / 2);

	// images
	noFill();
	imageMode(CORNER);
	const optMode = opt ? "reduced" : "original";

	// Site overlay
	if (getElement("showSite").on) {
		tint(255, 64);
		image(images[optMode].site, sitePlanOffest[0], sitePlanOffest[1], siteDimensions[0], siteDimensions[1]);
		stroke(0, 0, 255);
		rect(sitePlanOffest[0], sitePlanOffest[1], siteDimensions[0], siteDimensions[1]);
	}

	// Floor plan
	if (getElement("showFloor").on) {
		tint(255, 255);
		image(images[optMode].floors[_floor - 1], 0, 0, mapDimensions[0], mapDimensions[1]);
		stroke(255, 0, 0);
		rect(0, 0, mapDimensions[0], mapDimensions[1]);
	}

	// Points
	if (getElement("showPoints").on) {
		// Display dots for room selection
		// Iteration 1: Display the point and detect hovering if applicable
		for (let i = 0, hovering = false; i < rooms.length; i++) {
			var room = rooms[i];
			if (room.floor == _floor && room.center) {
				if (dist(_cursor.coords[0], _cursor.coords[1], room.center[0], room.center[1]) < 5 / _camera.zoom && !hovering) {
					room.hover = true;
					hovering = true;
					cursorType = HAND;
				} else room.hover = false;

				fill(255);
				if (room.hover) fill(mouseIsPressed ? color(250, 85, 85) : 128);
				
				stroke(192);
				strokeWeight(1 / _camera.zoom);
				ellipse(room.center[0], room.center[1], 10 / _camera.zoom, 10 / _camera.zoom);
			}
		}

		// Display selected points
		for (let i = 0; i < rows.length; i++) {
			const room = rooms.find(r => r.id == document.getElementById("point" + (i + 1)).value);
			if (!room || !room.center || room.floor != _floor) continue;

			// Draw center, doors, etc.
			stroke(255);
			if (getElement("devMode").on && getElement("objectType").value == "Room" && devData.room == room) {
				stroke(0, 255, 0);
				noFill();
				(room.doors || []).forEach(d => {
					rect(d[0] - 2 / _camera.zoom, d[1] - 2 / _camera.zoom, 4 / _camera.zoom, 4 / _camera.zoom);
				});
				(room.vertices || []).forEach(v => {
					triangle(v[0], v[1] - 2 / _camera.zoom, v[0] + 2 / _camera.zoom, v[1] + 2 / _camera.zoom, v[0] - 2 / _camera.zoom, v[1] + 2 / _camera.zoom);
				});
			}
			fill(0);
			strokeWeight(1 / _camera.zoom);
			ellipse(room.center[0], room.center[1], 10 / _camera.zoom, 10 / _camera.zoom);
			textAlign(CENTER, TOP);
			textSize(10 / _camera.zoom);
			textStyle(BOLD);
			text(room.id, room.center[0], room.center[1] - 15 / _camera.zoom);
		}

		// Iteration 2: Display information box if hovered
		for (let i = 0; i < rooms.length; i++) {
			var room = rooms[i];
			if (room.hover) {
				const infoX = room.center[0] - 120 / _camera.zoom, infoY = room.center[1] + 10 / _camera.zoom;
				fill(255, 255, 255, 192);
				stroke(0);
				rect(infoX, infoY, 240 / _camera.zoom, (128 + 12 * floor((room.notes || '').length / 50)) / _camera.zoom, 5 / _camera.zoom);
				fill(0);
				textAlign(LEFT, TOP);
				noStroke();
				textSize(10 / _camera.zoom);
				textStyle(NORMAL);
				text(`Name/ID: ${room.id}
Use: ${room.use || "N/A"}
Section: ${room.section}
Floor: ${room.floor}

Coverage: ${["center", "doors", "vertices"].filter(p => room[p]).length}/3
Entry last updated: ${room.updated}
Contributors (in order): ${room.authors.join(', ')}
Notes: ${room.notes || "None"}`, infoX + 2.5 / _camera.zoom, infoY + 2.5 / _camera.zoom, 230 / _camera.zoom);
			}
		}
	}

	// Draw an arrow centered at (x, y), facing in direction dir 
	function drawArrow (x, y, dir) {
		noFill();
		beginShape();
		vertex(x, y - 15 / _camera.zoom * dir);
		vertex(x + 10 / _camera.zoom, y - 5 / _camera.zoom * dir);
		vertex(x + 5 / _camera.zoom, y - 5 / _camera.zoom * dir);
		vertex(x + 5 / _camera.zoom, y + 5 / _camera.zoom * dir);
		vertex(x - 5 / _camera.zoom, y + 5 / _camera.zoom * dir);
		vertex(x - 5 / _camera.zoom, y - 5 / _camera.zoom * dir);
		vertex(x - 10 / _camera.zoom, y - 5 / _camera.zoom * dir);
		vertex(x, y - 15 / _camera.zoom * dir);
		endShape();
	}
	// Draw a dotted line from point a to b
	function drawDottedLine (a, b) {
		const len = dist(a[0], a[1], b[0], b[1]);
		for (let d = 0; d < len; d += 5 / _camera.zoom) {
			point(
				a[0] + (b[0] - a[0]) * d / len,
				a[1] + (b[1] - a[1]) * d / len
			);
		}
	}

	// Nodes and Links (dev mode)
	if (getElement("devMode").on) {
		// Display dots for node selection
		// Display the node and detect hovering if applicable
		for (let i = 0, hovering = false; i < nodes.length; i++) {
			var node = nodes[i];
			if (node.floor == _floor && node.pos) {
				if (["selectNode", "setNodeA", "setNodeB"].includes(devData.awaiting) && dist(_cursor.coords[0], _cursor.coords[1], node.pos[0], node.pos[1]) < 3 / _camera.zoom && !hovering) {
					node.hover = true;
					hovering = true;
					cursorType = HAND;
				} else node.hover = false;

				noFill();
				if (node.visited) fill(255, 0, 255);
				stroke(0);
				strokeWeight(1 / _camera.zoom);
				ellipse(node.pos[0], node.pos[1], 10 / _camera.zoom, 10 / _camera.zoom);

				fill(255);
				if (node.hover) fill(mouseIsPressed ? color(250, 85, 85) : 128);
				stroke(getElement("objectType").value == "Node" && node == devData.node ? color(0, 255, 0) : 192);
				ellipse(node.pos[0], node.pos[1], 6 / _camera.zoom, 6 / _camera.zoom);
			}
		}

		// Display the link and detect hovering if applicable
		for (let i = 0, hovering = false; i < links.length; i++) {
			var link = links[i];
			const selectedLink = getElement("objectType").value == "Link" && link == devData.link;

			if (link.points[0] && link.points[1] && link.points.find(p => p[2] == _floor)) {
				const hoveringOnLine = link.points[0][2] == link.points[1][2] && distToLine(_cursor.coords, link.points[0], link.points[1]) < 3 / _camera.zoom;
				const hoveringOnArrow =  link.points[0][2] != link.points[1][2] && link.points.find(p => dist(_cursor.coords[0], _cursor.coords[1], p[0], p[1]) < 10 / _camera.zoom);
				if (devData.awaiting == "selectLink" && (hoveringOnLine || hoveringOnArrow) && !hovering) {
					link.hover = true;
					hovering = true;
					cursorType = HAND;
				} else link.hover = false;

				stroke(0);
				if (link.visited) stroke(255, 0, 255);
				if (link.hover) stroke(mouseIsPressed ? color(250, 85, 85) : 128);
				if (selectedLink) stroke(0, 255, 0);
				strokeWeight(2 / _camera.zoom);
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
				textSize(8 / _camera.zoom);
				textAlign(CENTER, CENTER);
				link.points.forEach((p, i) => {
					if (p && p[2] == _floor) text('AB'[i], link.points[i][0], link.points[i][1]);
				});
			}
		}
	}

	// Draw route
	if (path && getElement("showPath").on) {
		stroke(0, 255, 255);
		strokeWeight(2 / _camera.zoom);

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
			textSize(10 / _camera.zoom);
			textAlign(CENTER, CENTER);
			textStyle(NORMAL);
			text(n + 1, (l.points[0][0] + l.points[1][0]) / 2, (l.points[0][1] + l.points[1][1]) / 2);
		});
	}

	// Ruler
	for (let i = 0; i < ruler.points.length; i++) {
		noStroke();
		fill(255, 0, 255);
		ellipse(ruler.points[i][0], ruler.points[i][1], 10 / _camera.zoom, 10 / _camera.zoom);
		fill(0);
		textSize(10 / _camera.zoom);
		textAlign(CENTER, CENTER);
		text(i + 1, ruler.points[i][0], ruler.points[i][1]);
		if (i == ruler.points.length - 1) break;
		stroke(255, 0, 255);
		line(ruler.points[i][0], ruler.points[i][1], ruler.points[i + 1][0], ruler.points[i + 1][1]);
	}

	pop();

	// cross
	noStroke();
	fill(0);
	rect(_camera.dispCenter[0] - 1, _camera.dispCenter[1] - 5, 2, 10);
	rect(_camera.dispCenter[0] - 5, _camera.dispCenter[1] - 1, 10, 2);

	/*
		UI Controls
	*/
	textFont("PT Sans");
	textSize(16);

	// Cursor
	cursor(cursorType);
	cursorType = ARROW;

	_cursor.pos = [mouseX, mouseY];
	_camera.floorCenter = [0, 1].map(i => mapDimensions[i] / 2 + _camera.pos[i] * _camera.zoom);

	_cursor.coords = [0, 1].map(i => (_cursor.pos[i] - (_camera.floorCenter[i] - _camera.dispCenter[i])) / _camera.zoom + mapDimensions[i] / 2);

	for (let i = 0, y = height; i < menus.length; i++) {
		y -= menus[i].h;
		menus[i].y = y;
		menus[i].draw();
		menus[i].interact();
	}
};