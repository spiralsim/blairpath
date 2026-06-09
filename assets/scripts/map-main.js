/* Data preprocessing */
var memoryData = null;
var tableLoaded = false;

function fxy(floor, x, y) {
	return {floor: floor, x: Math.round(x), y: Math.round(y)};
}

/**
 * `FXYtoString({floor: 1, x: 50, y: 100})` evaluates to `1,50,100`
 */
function FXYtoString(fxy) {
	if (fxy == null)
		return null;
	return `${fxy.floor},${fxy.x},${fxy.y}`;
}
function stringToFXY(string) {
	if (string == null)
		return null;
	const coordinates = string.split(',').map(s => parseInt(s));
	return {
		floor: coordinates[0],
		x: coordinates[1],
		y: coordinates[2],
	};
}
function idToFXY(id) {
	return memoryData.vertices[id].fxy;
}

function edgeLengthInM([id1, id2]) {
	const fxy1 = idToFXY(id1), fxy2 = idToFXY(id2);
	return Math.hypot(
		(fxy2.floor - fxy1.floor) * CONSTANTS.METERS_PER_FLOOR,
		(fxy2.x - fxy1.x) * CONSTANTS.M_PER_PIXEL,
		(fxy2.y - fxy1.y) * CONSTANTS.M_PER_PIXEL,
	);
}

function edgeToString([id1, id2]) {
	return id1 < id2 ? `${id1};${id2}` : `${id2};${id1}`;
}
function stringToEdge(s) {
	return s.split(';');
}

/**
 * In `data.json`, each vertex is stored with a `section` key.
 * 
 * Vertices are divided into 3 types:
 * 1. Place-type vertices have a section starting with an uppercase letter
 * 2. Path-type vertices have a section of "path"
 * 3. Border-type vertices have a section of "border"
 */
function vertexType(vertex) {
	switch (vertex.section) {
		case 'border':
			return 'border';
		case 'path':
			return 'path';
		default:
			return 'place';
	}
}

/**
 * Edges are also divided into 3 types:
 * 1. Path-type edges connect two path-type vertices
 * 2. Border-type edges connect two border-type vertices
 * 3. Temporary-type edges connect a place-type and path-type vertex 
 */
function edgeType(edge) {
	var vertexTypeCounts = {
		"border": 0,
		"path": 0,
		"place": 0,
	};
	edge.forEach(id => {
		vertexTypeCounts[vertexType(memoryData.vertices[id])]++;
	});
	if (vertexTypeCounts["border"] == 2)
		return "border";
	else if (vertexTypeCounts["path"] == 2)
		return "path";
	else if (vertexTypeCounts["path"] == 1 && vertexTypeCounts["place"] == 1)
		return "temporary";
	else
		throw `Invalid vertex type counts for edge ${edgeToString(edge)}: ` +
		`${JSON.stringify(vertexTypeCounts)}`;
}

var places = {};
/**
 * For each place, add a temporary edge from it to the nearest path vertex
 */
function refreshTemporaryEdges() {
	memoryData.edges.forEach(e => {
		if (edgeType(e) == "temporary")
			memoryData.edges.delete(e);
	});
	for (let id in places) {
		const place = places[id];
		var minDist = Infinity, tempEdge;
		Object.values(memoryData.vertices).forEach(v => {
			if (v.fxy.floor != place.fxy.floor) return;
			if (v.section != "path") return;
			const candidateEdge = [id, v.id];
			const candidateDist = edgeLengthInM(candidateEdge);
			if (candidateDist && candidateDist < minDist) {
				minDist = candidateDist;
				tempEdge = candidateEdge;
			}
		});
		memoryData.edges.add(tempEdge);
	}
}

$.getJSON("/data.json", function(diskData) {
	memoryData = structuredClone(diskData);

	Object.values(memoryData.vertices).forEach(v => {
		v.fxy = stringToFXY(v.fxy);
		if (vertexType(v) == "place")
			places[v.id] = v;
	});

	// Filters out invalid/duplicate edges
	var addedEdgeStrings = new Set();
	memoryData.edges = new Set();
	diskData.edges.forEach(e => {
		try {
			const edgeArray = stringToEdge(e);
			if (!addedEdgeStrings.has(e) && edgeType(edgeArray)) {
				addedEdgeStrings.add(e);
				memoryData.edges.add(edgeArray);
			}
		} catch (err) {}
	});

	refreshTemporaryEdges();

	// Remove placeholder rows
	for (let i = 1; i <= 2; i++)
		document.getElementById(`place-placeholder-${i}`).remove();

	// Create 2 initial rows
	tableLoaded = true;
	for (let i = 0; i < 2; i++)
		addPlaceInput();
});

function copyNextDiskData() {
	var nextDiskData = {
		timestamp: new Date().toUTCString(),
		vertices: structuredClone(memoryData.vertices),
		edges:
			Array.from(memoryData.edges)
			.filter(e => edgeType(e) != "temporary")
			.map(edgeToString)
			.sort(),
	};

	Object.values(nextDiskData.vertices)
		.forEach(v => v.fxy = FXYtoString(v.fxy));
	
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

		for (let id in places) {
			const place = places[id];
			var idWithUse = id;
			if (place.use && !id.includes(place.use))
				idWithUse += ` (${place.use})`;
			if (idWithUse.toUpperCase().indexOf(val.toUpperCase()) == -1)
				continue;

			b = document.createElement("div");
			b.innerHTML =
				idWithUse.replace(new RegExp(`(${val})`, "gi"), "<b>$1</b>") +
				`<span class="section-text">Floor ${place.fxy.floor}</span>` +
				`<input type="hidden" value="${place.id}">`;
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
	return getPlaceInput(index).value = value;
}

function addPlaceToTable(id) {
	// Handle edge case where there are no rows to begin with
	if (!rows.length) addPlaceInput();
	// Find the number of the first empty point input
	for (let i = 1; i <= rows.length; i++) {
		if (!getPointValue(i)) {
			setPointValue(i, id);
			return;
		}
	}
	addPlaceInput();
	setPointValue(rows.length, id);
}

// Remove a row from the points table
function removePlaceInput(id) {
	// Remove the row
	table.removeChild(table.childNodes[id]);
	rows.splice(id - 1, 1);
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
		autocomplete(document.getElementById("point-" + rowNum));
	}
};
// Add a row to the points table
function addPlaceInput () {
	if (!tableLoaded) return;
	const row = document.createElement("tr");
	const i = rows.length + 1; // NOTE: 1-indexed
	row.innerHTML = `<tr>
		<td>
			<button class="square close" onclick="removePlaceInput(${i})">
			</button>
		</td>
		<td style="display: flex">
			<input type="text" id="point-${i}" value="" class="point-input">
			</input>
		</td>
	</tr>`;
	row.id = `row-${i}`;
	rows.push(row);
	table.insertBefore(row, table.childNodes[i]);
	autocomplete(getPlaceInput(i));
};

/* Calculate Path */
const calcButton = document.getElementById("calc-button");
var totalDistanceInM = 0;
var lastPathQuery = null;

function clearCalculation() {
	totalDistanceInM = 0;
	edgesOnPath = new Set();
	document.getElementById("calc-result").innerHTML = '';
}

class PathQuery {
	/**
	 * 
	 * @param {FXY[]} points 
	 * @param {boolean} allowElevator 
	 * @param {number} walkingSpeed Walking speed in m/s
	 */
	constructor(points, allowElevator, walkingSpeed) {
		this.points = points;
		this.allowElevator = allowElevator;
		this.walkingSpeed = walkingSpeed;
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
		const xy = CONSTANTS.ELEVATOR_X_AND_Y;
		return e.every(id => {
			const fxy = idToFXY(id);
			return fxy.x == xy[0] && fxy.y == xy[1];
		});
	}

	/**
	 * Converts a path length to a human-readable string with meters and estimated
	 * time based on the walk speed: `a min b sec (x m)`. Lengths that are negative
	 * or undefined are converted to `No path`.
	 * @param {*} distanceInM Distance in meters
	 */
	function prettifyDistance(distanceInM) {
		if (distanceInM < 0 || distanceInM == undefined)
			return "No path";
		const timeInSec = Math.round(distanceInM / query.walkingSpeed);
		const min = Math.floor(timeInSec / 60), sec = timeInSec % 60;
		var strings = [];
		if (min)
			strings.push(`${min} min`);
		if (sec)
			strings.push(`${sec} s`);
		return `${strings.join(' ')} (${Math.round(distanceInM)} m)`;
	}

	var output = "";
	
	const graph = new WeightedGraph();
	memoryData.edges.forEach(e => {
		if (!edgeIsElevator(e) || query.allowElevator)
			graph.addEdge(e);
	});

	// Iterates through subpaths (paths between consecutive places in table)
	for (let i = 0; i < rows.length - 1; i++) {
		const start = query.points[i], finish = query.points[i + 1];

		var {path: subpath, distance: subpathDistanceInM} =
			graph.dijkstra(start, finish);

		if (subpathDistanceInM == Infinity)
			return finishCalc(`No path from ${start} to ${finish}`, true);

		const prettifiedDistance = prettifyDistance(subpathDistanceInM);
		output +=
			`<p>${start} → ${finish}\t` +
			`<span style='color: gray'>${prettifiedDistance}</span></p>`;

		for (let i = 0; i < subpath.length - 1; i++)
			edgesOnPath.add(edgeToString(subpath.slice(i, i + 2)));
		
		totalDistanceInM += subpathDistanceInM;
	}
	
	output = `<p><b>${prettifyDistance(totalDistanceInM)}</b></p>` + output;
	// Convert output string to HTML and print to website
	finishCalc(output);
}

function refreshPathQuery() {
	var canCalculate = rows.length >= 2;
	for (let i = 1; i <= rows.length; i++) {
		const input = getPlaceInput(i);
		const isValid = input.value in places;
		canCalculate &&= isValid;
		const borderColor = isValid || !input.value ? "--var(border)" : "red";
		input.setAttribute("style", `border-color: ${borderColor}`);
	}
	
	// Prevents duplicate calculations
	const pathQuery = new PathQuery(
		getPlaceInputs(),
		document.getElementById("allow-elevator").checked,
		parseFloat(document.getElementById("speed").value),
	);
	if (JSON.stringify(pathQuery) == JSON.stringify(lastPathQuery))
		return;
	lastPathQuery = pathQuery;

	clearCalculation();
	if (canCalculate) calculatePath(pathQuery);
}
