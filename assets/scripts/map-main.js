/* Data preprocessing */
var rooms = nodes = links = [];
var constants = {};
const dist2D = (a, b) => Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2));
var tableLoaded = false;
$.getJSON("/json/data.json", function (data) {
	// Load constants
	constants = data.constants;

	// Initial load for all object types
	["rooms", "nodes", "links"].forEach(o => eval(`${o} = data.${o};`));
	
	// Flatten rooms data structure into list
	rooms = rooms.map(f => Object.keys(f).map(s => f[s])).flat(2);
	// Sort rooms first by floor, then by name
	rooms.sort((a, b) => a.floor > b.floor || a.id > b.id ? 1 : -1);

	// Assign distances to links
	links.forEach(l => {
		l.gLen = l.vLen = 0;
		if (l.points[0][2] == l.points[1][2]) l.gLen = dist2D(l.points[0], l.points[1]);
		else l.vLen = (l.points[1][2] - l.points[0][2]) * constants.FEET_PER_FLOOR / constants.FEET_PER_PIXEL;
	});

	// Remove placeholder rows
	for (let i = 1; i <= 2; i++) document.getElementById("row-placeholder-" + i).remove();

	// Create 2 initial rows
	tableLoaded = true;
	for (let i = 0; i < 2; i++) addPoint();
});

/* Search bar adapted from https://www.w3schools.com/howto/howto_js_autocomplete.asp */
function autocomplete (input, arr) {
	var currentFocus;
	input.addEventListener("input", function (e) {
		var a, b, i, val = this.value;
		closeAllLists();

		if (!val) return false;
		currentFocus = -1;
		a = document.createElement("div");
		a.setAttribute("id", this.id + "autocomplete-list");
		a.setAttribute("class", "autocomplete-items");
		a.setAttribute("style", "max-height: 120px; overflow-y: auto");
		//a.setAttribute("style", "position: absolute");
		this.parentNode.appendChild(a);

		this.setAttribute("style", "background-color: lightpink");
		for (i = 0; i < arr.length; i++) {
			const name = arr[i].id + (arr[i].use && !arr[i].id.endsWith(arr[i].use) ? ` (${arr[i].use})` : "");
			if (name.toUpperCase().indexOf(val.toUpperCase()) > -1) {
				b = document.createElement("div");
				b.innerHTML = name.replace(new RegExp(`(${val})`, "gi"), "<b>$1</b>");
				//b.innerHTML = `<strong>${name.substr(0, len)}</strong>${name.substr(len)}`;
				b.innerHTML += `<span class="section-text" style="float: right">${arr[i].section} | Floor ${arr[i].floor}</span>`;
				b.innerHTML += `<input type="hidden" value="${arr[i].id}">`;
				a.appendChild(b);
				b.addEventListener("click", function (e) {
					input.value = this.getElementsByTagName("input")[0].value;
					input.setAttribute("style", "background-color: lightgreen")
					closeAllLists();
				});
			}
			if (val == arr[i].id) this.setAttribute("style", "background-color: lightgreen");
		}
	});
	input.addEventListener("keydown", function (e) {
		var x = document.getElementById(this.id + "autocomplete-list");
		if (x) x = x.getElementsByTagName("div");
		if (e.keyCode == 40) {
			currentFocus++;
			addActive(x);
		} else if (e.keyCode == 38) {
			currentFocus--;
			addActive(x);
		} else if (e.keyCode == 13) {
			e.preventDefault();
			if (currentFocus > -1) {
				if (x) x[currentFocus].click();
			}
		}
	});
	function addActive (x) {
		if (!x) return false;
		removeActive(x);
		if (currentFocus >= x.length) currentFocus = 0;
		if (currentFocus < 0) currentFocus = (x.length - 1);
		x[currentFocus].classList.add("autocomplete-active");
	}
	function removeActive (x) {
		for (var i = 0; i < x.length; i++) x[i].classList.remove("autocomplete-active");
	}
	function closeAllLists (element) {
		var x = document.getElementsByClassName("autocomplete-items");
		for (var i = 0; i < x.length; i++) {
			if (element != x[i] && element != input) x[i].parentNode.removeChild(x[i]);
		}
	}
	document.addEventListener("click", function (e) {
		closeAllLists(e.target);
	});
}

/* Point input */
var table = document.getElementById("points").childNodes[1], rows = [];
// Remove a row from the points table
function removePoint (ID) {
	// Remove the row
	table.removeChild(table.childNodes[ID]);
	rows.splice(ID - 1, 1);
	// Shift all the remaining rows to the correct number
	for (let i = 0; i < rows.length; i++) {
		const row = document.getElementById(rows[i].id),
		      rowStr = rows[i].id.split("-")[1],
		      // Save the value so that we can place it back in later
		      val = document.getElementById("point-" + rowStr).value,
		      rowNum = i + 1;
		row.id = "row-" + rowNum;
		row.innerHTML = row.innerHTML.replace(new RegExp(rowStr, "g"), rowNum);
		document.getElementById("point-" + rowNum).value = val;
		autocomplete(document.getElementById("point-" + rowNum), rooms);
	}
};
// Add a row to the points table
function addPoint () {
	if (!tableLoaded) return;
	const row = document.createElement("tr"), rowNum = rows.length + 1;
	row.innerHTML = `<tr>
		<td>${rowNum}</td>
		<td><input type="text" id="point-${rowNum}" value="" class="point-input"></input></td>
		<td><button class="square remove-point" onclick="removePoint(${rowNum})"></button></td>
	</tr>`;
	row.id = "row-" + rowNum;
	rows.push(row);
	table.insertBefore(row, table.childNodes[rowNum]);
	autocomplete(document.getElementById("point-" + rowNum), rooms);
};

/* Calculate Route */
var path;
// Creates a temporary node and link to connect a room to a link on the graph, then returns the new node
function createTempNodeAndLink (room) {
	// (If this has already been done, return the previously created node)
	const existingNode = nodes.find(n => n.pos == room.center && n.floor == room.floor);
	if (existingNode) return existingNode;

	var newNode = {
		pos: room.center,
		floor: room.floor,
		links: [],
		tmp: true,
		id: ~~(Math.random() * 1000000)
	}, nearestNode = nodes.reduce((prev, curr) => {
		  return curr.floor == room.floor && dist2D(curr.pos, room.center) < dist2D(prev.pos, room.center) ? curr : prev;
	}), newLink = {
		points: [
			[... newNode.pos, room.floor],
			[... nearestNode.pos, room.floor]
		],
		gLen: dist2D(newNode.pos, nearestNode.pos),
		vLen: 0,
		nodes: [newNode.id, nearestNode.id],
		tmp: true,
		id: ~~(Math.random() * 1000000)
	};
	[newNode, nearestNode].forEach(n => n.links.push(newLink.id));

	nodes.push(newNode);
	links.push(newLink);

	return newNode;
}
// Returns the shortest path, with some additional information
function computeDijkstraPath (start, end, options) {
	// Set up algorithm
	var queue = [start], currNode, result;
	nodes.forEach(n => {
		n.shortestDist = n == start ? 0 : Infinity;
		n.shortestPath = {
			length: 0,
			nodes: [start],
			links: []
		};
		n.visited = false;
	});
	links.forEach(l => {
		l.visited = false;
	});

	// Process each unvisited node if we have not reached the end node
	while (queue.length) {
		currNode = queue[0];
		var nextNode = undefined;
		// Process the current node's connecting links
		currNode.links.forEach(lID => {
			const linkObj = links.find(i => i.id == lID);
			if (linkObj.visited) return;
			if (!options.allowElevator && linkObj.name == "Elevator") return;

			const adjNodeID = linkObj.nodes.find(nID => nID != currNode.id),
				  adjNode = nodes.find(n => n.id == adjNodeID),
				  distFromNode = currNode.shortestDist + linkObj.gLen + linkObj.vLen;
			if (distFromNode < adjNode.shortestDist) {
				adjNode.shortestDist = distFromNode;
				adjNode.shortestPath = {
					length: distFromNode,
					nodes: [... currNode.shortestPath.nodes, adjNode],
					links: [... currNode.shortestPath.links, linkObj]
				};
				//console.log("yes; d=" + adjNode.shortestDist + ", |p|=" + adjNode.shortestPath.length)
			}
			linkObj.visited = true;
			// Add the adjacent node to the queue if it is still unprocessed
			if (!adjNode.visited) queue.push(adjNode);
		});
		currNode.visited = true;

		// If we have visited the end node, we are done
		if (currNode.id == end.id) {
			result = currNode.shortestPath;
			break;
		}

		// Select a new node and repeat
		queue.splice(0, 1);
	}

	return result;
}

function clearCalc () {
	// Work in reverse to delete temporary nodes
	for (let i = nodes.length - 1; i >= 0; i--) {
		delete nodes[i].shortestDist;
		delete nodes[i].shortestPath;
		delete nodes[i].visited;
		if (nodes[i].tmp) {
			deleteLink(nodes[i].links[0]);
			nodes.splice(i, 1);
		}
	}
	links.forEach(l => {
		delete l.visited;
	});
	path = null;
	document.getElementById("calc-result").innerHTML = '';
}
function calculate () {
	clearCalc();

	const calcButton = document.getElementById("calc-button"), calcResult = document.getElementById("calc-result");
	function finishCalc (msg, err) {
		calcResult.innerHTML = `<p style="color: ${err ? "red" : "black"}">${msg}</p>`;
		calcButton.removeAttribute("disabled");
		calcButton.innerHTML = "Calculate Route";
	}

	calcButton.setAttribute("disabled", "");
	calcButton.innerHTML = "Calculating...";

	const startTime = new Date().getTime();
	const options = {
		allowElevator: document.getElementById("allow-elevator").checked
	};

	// Check that there are enough points
	if (rows.length < 2) finishCalc("There must be at least two input points to calculate a route.", true);
	else {
		// Check that all points are valid
		for (let i = 1; i <= rows.length; i++) {
			const col = document.getElementById("point-" + i).style["background-color"];
			if (col != "lightgreen") return finishCalc(`Point #${i} is ${col == "lightpink" ? "invalid" : "empty"}.`, true);
		}

		var output = "";
		path = {
			length: 0,
			nodes: [],
			links: []
		};

		for (let i = 0, prevSteps = 0; i < rows.length - 1; i++) {
			// "boundary" refers to the start or end of this subpath
			const boundaryRoomIDs = [1, 2].map(shift => document.getElementById("point-" + (i + shift)).value),
				  boundaryRoomObjs = boundaryRoomIDs.map(id => rooms.find(r => r.id == id));
			const boundaryNodes = boundaryRoomObjs.map(p => createTempNodeAndLink(p));

			output += `<p><b>[${i + 1}]</b> Compute the shortest path from <code>${boundaryRoomIDs[0]}</code> to <code>${boundaryRoomIDs[1]}</code>, with elevators ${options.allowElevator ? "allowed" : "disallowed"}.</p>`;
			
			const subPath = computeDijkstraPath(... boundaryNodes, options);
			if (subPath) {
				path.length += subPath.length;
				["nodes", "links"].forEach(k => {
					path[k] = path[k].concat(subPath[k]);
				});
				output += `<p>The shortest path found contains <code>${Math.max(subPath.links.length - 2, 0)}</code> hallway(s)/stairwell(s) (dotted lines are not counted) and has a length of <code>${(subPath.length * constants.FEET_PER_PIXEL).toFixed(2)} ft</code> (counting both horizontal and vertical distance).</p>`;

				if (subPath.links.find(l => l.name == "Elevator")) {
					output += `<div class="banner gray" style="margin-bottom: 20px">
						<b>⚠️ This route uses the elevator.</b> <p>Students are required to have a pass from the nurse to use the elevator.</p>
					</div>`;
				}

				var subPathTable = "<tr> <th>#</th> <th>Step</th> <th>Length (ft)</th> </tr>";
				for (let j = 0; j < subPath.links.length; j++) {
					const link = subPath.links[j], nodeA = subPath.nodes[j], nodeB = subPath.nodes[j + 1];
					subPathTable += `<tr>
						<td>${j + prevSteps + 1}</td>
						<td>${link.name ? "Go along " + link.name : dispCoords([... nodeA.pos, nodeA.floor]) + " → " + dispCoords([... nodeB.pos, nodeB.floor])}</td>
						<td>${link.gLen ? (link.gLen * constants.FEET_PER_PIXEL).toFixed(2) : (link.vLen * constants.FEET_PER_PIXEL).toFixed(2) + " (vertical)"}</td>
					</tr>`;
				}
				prevSteps += subPath.links.length;
				output += "<table>" + subPathTable + "</table>";
			} else output += "<p style='color: red'>A path between these points could not be found. Try adjusting the options.</p>"

			output += "<hr>";
		}

		//const path = computeDijsktraPath()
		const endTime = new Date().getTime();
		
		output += "<p>Total path length: <code>" + (path.length * constants.FEET_PER_PIXEL).toFixed(2) + " ft</code></p>";
		output += "<p>Process took " + (endTime - startTime) + " ms</p>";
		// Convert output string to HTML and print to website
		finishCalc(output);
	}	
}