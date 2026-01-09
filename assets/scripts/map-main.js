var walkingSpeed = 1.35; // Walking speed in m/s
/**
 * Converts a path length to a human-readable string with meters and estimated
 * time based on `walkingSpeed`: `a min b sec (x m)`. Lengths that are negative
 * or undefined are converted to `No path`.
 * @param {*} distance Distance in normalized px
 */
function prettifyDistance(distance) {
	if (distance < 0 || distance == undefined) return `No path`;
	const lengthInM = distance * constants.METERS_PER_PIXEL,
		timeInSec = Math.round(lengthInM / walkingSpeed);
	const min = Math.floor(timeInSec / 60), sec = timeInSec % 60;
	var res = ``;
	if (min) res += `${min} min `;
	if (sec) res += `${sec} s `;
	return res + `(${Math.round(lengthInM)} m)`;
}

/* Data preprocessing */
var rooms = [], roomIDs;
var edges = [];
var constants = {};
function dist2D(a, b) {
	return Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2));
}

class Vertex {
	constructor([floor, x, y]) {
		this.floor = floor;
		this.x = x;
		this.y = y;
	}
	toString() {
		return `(${this.floor},${this.x},${this.y})`
	}
}
class Edge {
	/**
	 * @param {Vertex} endpoint1
	 * @param {Vertex} endpoint2
	 * @param {string} name
	 */
	constructor(endpoint1, endpoint2, name) {
		this.endpoint1 = endpoint1;
		this.endpoint2 = endpoint2;
		this.name = name;
		this.isHovered = false;
	}

	length() {
		return Math.hypot(
			(this.endpoint2.floor - this.endpoint1.floor) * constants.METERS_PER_FLOOR,
			(this.endpoint2.x - this.endpoint1.x) * constants.METERS_PER_PIXEL,
			(this.endpoint2.y - this.endpoint1.y) * constants.METERS_PER_PIXEL,
		);
	}
	checkHovered() {
		this.isHovered = false;
		if (this.endpoint1.floor == this.endpoint2.floor) {
			if (distToLine(CURSOR.virtPos, this.endpoint1, this.endpoint2) < EDGE_WIDTH / VIEW.zoom)
				this.isHovered = true;
		} else {
			if (dist(this.endpoint1.x, this.endpoint1.y, CURSOR.virtPos.x, CURSOR.virtPos.y) < 10 / VIEW.zoom)
				this.isHovered = true;
		}
	}
	equals({ endpoint1, endpoint2 }) {
		const thisEndpoints = new Set([this.endpoint1.toString(), this.endpoint2.toString()]);
		const otherEndpoints = new Set([endpoint1.toString(), endpoint2.toString()]);
		return thisEndpoints.symmetricDifference(otherEndpoints).size == 0;
	}
	findInDatabase() {
		for (let i = 0; i < edges.length; i++) {
			const e = edges[i];
			if (this.equals(e)) return e;
		}
	}
}

var tableLoaded = false;
var vertices = new Set();
$.getJSON('/data.json', function (data) {
	// Load constants
	constants = data.constants;

	// Initial load for all object types
	rooms = data.rooms;
	edges = data.edges.map(e => new Edge(new Vertex(e.endpoint1), new Vertex(e.endpoint2), e.name));
	edges.forEach(e => {
		vertices.add(e.endpoint1);
		vertices.add(e.endpoint2);
	});

	// Flatten rooms data structure into list
	rooms = rooms.map(f => Object.keys(f).map(s => f[s])).flat(2);
	// Sort rooms first by floor, then by name
	rooms.sort((a, b) => a.floor > b.floor || a.id > b.id ? 1 : -1);

	rooms.forEach(r => {
		const roomVertex = new Vertex([r.floor, ...r.center]);
		var minDist = Infinity, tempEdge;
		vertices.forEach(v => {
			if (v.floor != r.floor) return;
			const edge = new Edge(v, roomVertex);
			const dist = edge.length();
			if (dist < minDist) {
				minDist = dist;
				tempEdge = edge;
			}
		});
		tempEdge.isTemporary = true;
		edges.push(tempEdge);
	});
	roomIDs = new Set(rooms.map(({id}) => id));

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
		this.parentNode.appendChild(a);

		for (i = 0; i < arr.length; i++) {
			const name = arr[i].id + (arr[i].use && !arr[i].id.endsWith(arr[i].use) ? ` (${arr[i].use})` : "");
			if (name.toUpperCase().indexOf(val.toUpperCase()) > -1) {
				b = document.createElement("div");
				b.innerHTML = name.replace(new RegExp(`(${val})`, "gi"), "<b>$1</b>");
				b.innerHTML += `<span class="section-text" style="float: right">${arr[i].section} (${arr[i].floor})</span>`;
				b.innerHTML += `<input type="hidden" value="${arr[i].id}">`;
				a.appendChild(b);
				b.addEventListener("click", function (e) {
					input.value = this.getElementsByTagName("input")[0].value;
					closeAllLists();
				});
			}
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
		<td style="display: flex"><input type="text" id="point-${rowNum}" value="" class="point-input"></input></td>
		<td><button class="square remove-point" onclick="removePoint(${rowNum})"></button></td>
	</tr>`;
	row.id = "row-" + rowNum;
	rows.push(row);
	table.insertBefore(row, table.childNodes[rowNum]);
	autocomplete(document.getElementById("point-" + rowNum), rooms);
};

/* Calculate Path */
const calcButton = document.getElementById("calc-button");
var totalDistance = 0;

function clearCalc () {
	edges.forEach(e => e.isPath = false);
	totalDistance = 0;
	document.getElementById("calc-result").innerHTML = '';
};

function calculate () {
	clearCalc();

	const calcResult = document.getElementById("calc-result");
	function finishCalc (msg, err) {
		if (err) edges.forEach(e => e.isPath = false);
		calcResult.innerHTML = `<p style="color: ${err ? "red" : "black"}">${msg}</p>`;
		calcButton.removeAttribute("disabled");
		calcButton.innerHTML = "Calculate Path";
	}

	calcButton.setAttribute("disabled", "");
	calcButton.innerHTML = "Calculating...";

	const options = {
		allowElevator: document.getElementById("allow-elevator").checked
	};

	// Check that there are enough points
	var output = "";
	
	const graph = new WeightedGraph();
	edges.forEach(e => {
		if (e.name != 'Elevator' || options.allowElevator) graph.addEdge(e);
	});

	for (let i = 0; i < rows.length - 1; i++) {
		const subpathRoomIDs = [1, 2].map(j => document.getElementById(`point-${i + j}`).value);
		const subpathRooms = subpathRoomIDs.map(id => rooms.find(r => r.id == id));
		const subpathRoomVertices = subpathRooms.map(room => new Vertex([room.floor, ...room.center]));

		var {path: subpathVertices, distance: subDistance} = graph.Dijkstra(...subpathRoomVertices);

		if (subDistance == Infinity)
			return finishCalc(`We couldn't find a path from ${subpathRoomIDs.join(' to ')}.`, true);

		output +=
			`<p>${subpathRoomIDs.join(' → ')}` +
			`\t` +
			`<span style='color: gray'>${prettifyDistance(subDistance)}</span></p>`;

		for (let i = 0; i < subpathVertices.length - 1; i++) {
			const edge = new Edge(subpathVertices[i], subpathVertices[i + 1]);
			edge.findInDatabase().isPath = true;
		}
		
		totalDistance += subDistance;
	}
	
	output = `<p><b>${prettifyDistance(totalDistance)}</b></p>` + output;
	// Convert output string to HTML and print to website
	finishCalc(output);
}