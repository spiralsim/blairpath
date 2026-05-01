/**
 * Converts a path length to a human-readable string with meters and estimated
 * time based on `walkingSpeed`: `a min b sec (x m)`. Lengths that are negative
 * or undefined are converted to `No path`.
 * @param {*} distance Distance in normalized px
 */
function prettifyDistance(distance) {
	if (distance < 0 || distance == undefined) return `No path`;
	const lengthInM = distance * data.constants.METERS_PER_PIXEL;
	const walkingSpeed = data.constants["WALKING_SPEED_IN_METERS_PER_SECOND"];
	const timeInSec = Math.round(lengthInM / walkingSpeed);
	const min = Math.floor(timeInSec / 60), sec = timeInSec % 60;
	var res = ``;
	if (min) res += `${min} min `;
	if (sec) res += `${sec} s `;
	return res + `(${Math.round(lengthInM)} m)`;
}

/* Data preprocessing */
var data = {};
var tableLoaded = false;
var vertices = null;
function dist2D(a, b) {
	return Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2));
}

function vertexToString({floor, x, y}) {
	return `${floor},${x},${y}`;
}

function edgeLength({endpoint1: {floor: f1, x: x1, y: y1}, endpoint2: {floor: f2, x: x2, y: y2}}) {
	return Math.hypot(
		(f2 - f1) * data.constants.METERS_PER_FLOOR,
		(x2 - x1) * data.constants.METERS_PER_PIXEL,
		(y2 - y1) * data.constants.METERS_PER_PIXEL,
	);
}

$.getJSON('/data.json', function (payload) {
	data = payload;
	var verticesSet = new Set();
	data.edges.forEach(e => {
		verticesSet.add(e.endpoint1);
		verticesSet.add(e.endpoint2);
	});
	vertices = Array.from(verticesSet);

	Object.values(data.places).forEach(p => {
		const placeVertex = {floor: p.floor, x: p.center[0], y: p.center[1]};
		var minDist = Infinity, tempEdge;
		vertices.forEach(v => {
			if (v.floor != p.floor) return;
			const edge = {endpoint1: v, endpoint2: placeVertex};
			const dist = edgeLength(edge);
			if (dist < minDist) {
				minDist = dist;
				tempEdge = edge;
			}
		});
		tempEdge.isTemporary = true;
		data.edges.push(tempEdge);
	});

	// Remove placeholder rows
	for (let i = 1; i <= 2; i++) document.getElementById("row-placeholder-" + i).remove();

	// Create 2 initial rows
	tableLoaded = true;
	for (let i = 0; i < 2; i++) addPoint();
});

function updateOutput() {
	var permanentData = structuredClone(data);
	permanentData["edges"] = permanentData["edges"].filter(e => !e.isTemporary);
	permanentData["edges"].forEach(e => {
		delete e.onPath;
		delete e.isHovered;
	});
	const output = JSON.stringify(permanentData, null, 4).replace(/ {4}/g, '\t');
	document.getElementById("outputField").value = output;
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

		for (let id in data.places) {
			const place = data.places[id];
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
function getPointInput(index) {
	return document.getElementById(`point-${index}`);
}
function getPointValue(index) {
	return getPointInput(index).value;
}
function getPointValues() {
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
		autocomplete(document.getElementById("point-" + rowNum), data.places);
	}
};
// Add a row to the points table
function addPoint () {
	if (!tableLoaded) return;
	const row = document.createElement("tr"), rowNum = rows.length + 1;
	row.innerHTML = `<tr>
		<td><button class="square remove-point" onclick="removePoint(${rowNum})"></button></td>
		<td style="display: flex"><input type="text" id="point-${rowNum}" value="" class="point-input"></input></td>
	</tr>`;
	row.id = "row-" + rowNum;
	rows.push(row);
	table.insertBefore(row, table.childNodes[rowNum]);
	autocomplete(document.getElementById("point-" + rowNum), data.places);
};

/* Calculate Path */
const calcButton = document.getElementById("calc-button");
var totalDistance = 0;
var pathPoints = [];

function clearCalculation() {
	totalDistance = 0;
	data.edges.forEach(e => e.onPath = false);
	document.getElementById("calc-result").innerHTML = '';
}

function calculateRoute() {
	const calcResult = document.getElementById("calc-result");
	function finishCalc (msg, err) {
		if (err) data.edges.forEach(e => e.isPath = false);
		calcResult.innerHTML = `<p style="color: ${err ? "red" : "black"}">${msg}</p>`;
	}

	const elevatorIsAllowed = document.getElementById("allow-elevator").checked;

	// Check that there are enough points
	var output = "";
	
	const graph = new WeightedGraph();
	data.edges.forEach(e => {
		if (e.name != 'Elevator' || elevatorIsAllowed) graph.addEdge(e);
	});

	var pathDirectedEdges = new Set();

	for (let i = 0; i < rows.length - 1; i++) {
		const subpathPlaceIDs = [1, 2].map(j => document.getElementById(`point-${i + j}`).value);
		const subpathPlaces = subpathPlaceIDs.map(id => data.places[id]);
		const subpathPlaceVertices = subpathPlaces.map(room => ({
			floor: room.floor,
			x: room.center[0],
			y: room.center[1]
		}));

		var {path: subpathVertices, distance: subpathDistance} =
			graph.Dijkstra(...subpathPlaceVertices);

		if (subpathDistance == Infinity)
			return finishCalc(`No path from ${subpathPlaceIDs.join(' to ')}`, true);

		output +=
			`<p>${subpathPlaceIDs.join(' → ')}\t` +
			`<span style='color: gray'>${prettifyDistance(subpathDistance)}</span></p>`;

		for (let i = 0; i < subpathVertices.length - 1; i++)
			pathDirectedEdges.add(JSON.stringify(subpathVertices.slice(i, i + 2)));
		
		totalDistance += subpathDistance;
	}

	data.edges.forEach(e => {
		const v1 = e.endpoint1, v2 = e.endpoint2;
		const e1 = JSON.stringify([v1, v2]), e2 = JSON.stringify([v2, v1]);
		if (pathDirectedEdges.has(e1) || pathDirectedEdges.has(e2))
			e.onPath = true;
	});
	
	output = `<p><b>${prettifyDistance(totalDistance)}</b></p>` + output;
	// Convert output string to HTML and print to website
	finishCalc(output);
}

function refreshPointTable() {

	var canCalculate = rows.length >= 2;
	for (let i = 1; i <= rows.length; i++) {
		const input = getPointInput(i);
		const isValid = !!data.places[input.value];
		canCalculate &&= isValid;
		const borderColor = isValid || !input.value ? '--var(border)' : 'red';
		input.setAttribute("style", `border-color: ${borderColor}`);
	}
	
	// Prevents duplicate calculations
	const newPathPoints = getPointValues();
	if (newPathPoints.toString() == pathPoints.toString()) return;
	pathPoints = newPathPoints;
	
	clearCalculation();
	if (canCalculate) calculateRoute();
}
