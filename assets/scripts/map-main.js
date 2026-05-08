/* Data preprocessing */
var memoryData = {};
var tableLoaded = false;
function dist2D(a, b) {
	return Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2));
}

function edgeLengthInPixels([{floor: f1, x: x1, y: y1}, {floor: f2, x: x2, y: y2}]) {
	return Math.hypot(
		(f2 - f1) * memoryData.constants.METERS_PER_FLOOR,
		(x2 - x1) * memoryData.constants.METERS_PER_PIXEL,
		(y2 - y1) * memoryData.constants.METERS_PER_PIXEL,
	);
}

function FXY(floor, x, y) {
	return {floor: floor, x: Math.round(x), y: Math.round(y)};
}

/**
 * `FXYtoString({floor: 1, x: 50, y: 100})` evaluates to `1,50,100`
 */
function FXYtoString({floor, x, y}) {
	return `${floor},${x},${y}`;
}

/**
 * `edgeToString({floor: 1, x: 50, y: 100}, {floor: 2, x: 300, y: 400})`
 *  evaluates to `1,50,100;2,300,400`
 */
function edgeToString(e) {
	return e.map(fxy => FXYtoString(fxy)).join(';');
}

/**
 * A mapping from a vertex position's string form to the vertex itself
 * 
 * Example:
 * 
 * Suppose vertex V has FXY floor 2, x 50, y 100.
 * 
 * `stringToVertex['2,50,100']` evaluates to V.
 */
var stringToVertex = {};

function fxyToVertex(fxy) {
	return stringToVertex[FXYtoString(fxy)];
}

/**
 * A mapping from a place's ID to the place vertex itself
 * 
 * Example:
 * 
 * Suppose place P has ID 101.
 * 
 * `idToPlace['101']` evaluates to P.
 */
var idToPlace = {};

/**
 * In `data.json`, each vertex is stored with a `section` key.
 * 
 * Here's a breakdown of vertices by type and `section`:
 * 
 * 1. Place vertices have a `section` starting with an uppercase letter
 * 2. Path vertices have a `section` of `"path"`
 * 3. Border vertices have a `section` of `"border"`
 * 
 * The possible edge types are `"border"`, `"temporary"`, and `"path"`.
 * 
 * @param {*} edge 
 */
function edgeType(edge) {
	const endpointSections = edge.map(fxyToVertex).map(v => v.section);
	if (endpointSections[0] == 'border') return 'border';
	else if (endpointSections[0] == 'path') return 'path';
	else return 'temporary';
}

$.getJSON('/data.json', function (payload) {
	memoryData = payload;

	memoryData.vertices.forEach(v => {
		stringToVertex[FXYtoString(v.fxy)] = v;
		if (v.id) idToPlace[v.id] = v;
	});

	// For each place, add a temporary edge from it to the nearest path vertex
	Object.values(idToPlace).forEach(place => {
		var minDist = Infinity, tempEdge;
		memoryData.vertices.forEach(v => {
			if (v.fxy.floor != place.fxy.floor) return;
			if (v.section != 'path') return;
			const edge = [place.fxy, v.fxy];
			const dist = edgeLengthInPixels(edge);
			if (dist && dist < minDist) {
				minDist = dist;
				tempEdge = edge;
			}
		});
		memoryData.edges.push(tempEdge);
	});

	// Remove placeholder rows
	for (let i = 1; i <= 2; i++)
		document.getElementById(`place-placeholder-${i}`).remove();

	// Create 2 initial rows
	tableLoaded = true;
	for (let i = 0; i < 2; i++) addPlaceInput();
});

function copyNextDiskData() {
	var nextDiskData = structuredClone(memoryData);
	nextDiskData.edges = nextDiskData.edges.filter(
		e => edgeType(e) != 'temporary'
	);
	
	const output = JSON.stringify(nextDiskData, null, 4);
	navigator.clipboard.writeText(output);
}

/* Search bar adapted from https://www.w3schools.com/howto/howto_js_autocomplete.asp */
function autocomplete (input) {
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

		for (let id in memoryData.places) {
			const place = memoryData.places[id];
			var name = id;
			if (place.use && !id.includes(place.use))
				name += ` (${place.use})`;
			if (name.toUpperCase().indexOf(val.toUpperCase()) == -1)
				continue;

			b = document.createElement("div");
			b.innerHTML = name.replace(new RegExp(`(${val})`, "gi"), "<b>$1</b>");
			b.innerHTML += `<span class="section-text" style="float: right">Floor ${place.floor}</span>`;
			b.innerHTML += `<input type="hidden" value="${place.id}">`;
			a.appendChild(b);
			b.addEventListener("click", function (e) {
				input.value = this.getElementsByTagName("input")[0].value;
				closeAllLists();
			});
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
function getPlaceInput(index) {
	return document.getElementById(`point-${index}`);
}
function getPointValue(index) {
	return getPlaceInput(index).value;
}
function getPlaceInputs() {
	var values = [];
	for (let i = 1; i <= rows.length; i++)
		values.push(getPointValue(i));
	return values;
}
function setPointValue(index, value) {
	return document.getElementById(`point-${index}`).value = value;
}

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
		      val = getPointValue(rowStr),
		      rowNum = i + 1;
		row.id = "row-" + rowNum;
		row.innerHTML = row.innerHTML.replace(new RegExp(rowStr, "g"), rowNum);
		setPointValue(rowNum, val);
		autocomplete(document.getElementById("point-" + rowNum), memoryData.places);
	}
};
// Add a row to the points table
function addPlaceInput () {
	if (!tableLoaded) return;
	const row = document.createElement("tr"), rowNum = rows.length + 1;
	row.innerHTML = `<tr>
		<td><button class="square remove-point" onclick="removePoint(${rowNum})"></button></td>
		<td style="display: flex"><input type="text" id="point-${rowNum}" value="" class="point-input"></input></td>
	</tr>`;
	row.id = "row-" + rowNum;
	rows.push(row);
	table.insertBefore(row, table.childNodes[rowNum]);
	autocomplete(document.getElementById("point-" + rowNum), memoryData.places);
};

/* Calculate Path */
const calcButton = document.getElementById("calc-button");
var totalDistance = 0;
var lastPathQuery = null;

function clearCalculation() {
	totalDistance = 0;
	memoryData.edges.forEach(e => e.onPath = false);
	document.getElementById("calc-result").innerHTML = '';
}

class PathQuery {
	constructor(points, allowElevator) {
		this.points = points;
		this.allowElevator = allowElevator;
	}
}

/**
 * Set of **directed** edges on the current computed path (for each edge, its opposite is also included)
 */
var edgesOnPath = new Set();
function calculatePath(query) {
	const calcResult = document.getElementById("calc-result");
	function finishCalc (msg, err) {
		if (err) memoryData.edges.forEach(e => e.isPath = false);
		calcResult.innerHTML = `<p style="color: ${err ? "red" : "black"}">${msg}</p>`;
	}

	function edgeIsElevator(e) {
		const xy = memoryData.constants.ELEVATOR_X_AND_Y;
		return e.every(position => position.x == xy[0] && position.y == xy[1]);
	}

	/**
	 * Converts a path length to a human-readable string with meters and estimated
	 * time based on `walkingSpeed`: `a min b sec (x m)`. Lengths that are negative
	 * or undefined are converted to `No path`.
	 * @param {*} distance Distance in normalized px
	 */
	function prettifyDistance(distance) {
		if (distance < 0 || distance == undefined) return `No path`;
		const lengthInM = distance * memoryData.constants.METERS_PER_PIXEL;
		const walkingSpeed = memoryData.constants.WALKING_SPEED_IN_METERS_PER_SECOND;
		const timeInSec = Math.round(lengthInM / walkingSpeed);
		const min = Math.floor(timeInSec / 60), sec = timeInSec % 60;
		var res = ``;
		if (min) res += `${min} min `;
		if (sec) res += `${sec} s `;
		return res + `(${Math.round(lengthInM)} m)`;
	}

	// Check that there are enough points
	var output = "";
	
	const graph = new WeightedGraph();
	memoryData.edges.forEach(e => {
		if (!edgeIsElevator(e) || query.allowElevator) graph.addEdge(e);
	});

	edgesOnPath = new Set();

	for (let i = 0; i < rows.length - 1; i++) {
		const subpathIDs = query.points.slice(i, i + 2);
		const subpathPlaceVertices = subpathIDs.map(id => idToPlace[id]);
		const subpathPlacePositions = subpathPlaceVertices.map(v => v.fxy);

		var {path: subpathPositions, distance: subpathDistance} =
			graph.Dijkstra(...subpathPlacePositions);

		if (subpathDistance == Infinity)
			return finishCalc(`No path from ${subpathIDs.join(' to ')}`, true);

		output +=
			`<p>${subpathIDs.join(' → ')}\t` +
			`<span style='color: gray'>${prettifyDistance(subpathDistance)}</span></p>`;

		for (let i = 0; i < subpathPositions.length - 1; i++) {
			const direction1 = subpathPositions.slice(i, i + 2);
			edgesOnPath.add(edgeToString(direction1));
			edgesOnPath.add(edgeToString(direction1.reverse()));
		}
		
		totalDistance += subpathDistance;
	}
	
	output = `<p><b>${prettifyDistance(totalDistance)}</b></p>` + output;
	// Convert output string to HTML and print to website
	finishCalc(output);
}

function refreshPointTable() {
	var canCalculate = rows.length >= 2;
	for (let i = 1; i <= rows.length; i++) {
		const input = getPlaceInput(i);
		const isValid = input.value in idToPlace;
		canCalculate &&= isValid;
		const borderColor = isValid || !input.value ? '--var(border)' : 'red';
		input.setAttribute("style", `border-color: ${borderColor}`);
	}
	
	// Prevents duplicate calculations
	const pathQuery = new PathQuery(
		getPlaceInputs(),
		document.getElementById('allow-elevator').checked,
	);
	if (JSON.stringify(pathQuery) == JSON.stringify(lastPathQuery)) return;
	lastPathQuery = pathQuery;

	clearCalculation();
	if (canCalculate) calculatePath(pathQuery);
}
