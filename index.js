const express = require("express");
const http = require("http")
const fs = require("fs");

// Setup
const app = express();
function runAppWithPort(port) {
	app
		.use(express.static(`${__dirname}/assets`))
		.set("views", `${__dirname}/views`)
		.set("view engine", "ejs")
		.listen(port, () => console.log(`Listening on port ${port}`));
}
runAppWithPort(process.env.PORT);

// Handle all asset and page requests
const DISK_DATA = JSON.parse(fs.readFileSync(`./assets/data.json`));
const VERTICES_ARRAY = Object.values(DISK_DATA.vertices);
const OPTIONS = {
	diskData: DISK_DATA,
	verticesArray: VERTICES_ARRAY,
	edges: DISK_DATA.edges,
	numPlaces: VERTICES_ARRAY.filter(v => v.section != "border" && v.section != "path").length,
	numFloors: new Set(VERTICES_ARRAY.map(v => v.fxy.split(',')[0])).size,
};
app.get(/.*/, (request, response) => {
	const path = request.path;
	if (path == "/")
		response.render(`pages/map`, OPTIONS);
	else if (path == "/agenda-map.jpg")
		response.sendFile(`${__dirname}/assets/agenda-map.jpg`)
	else if (fs.existsSync(`${__dirname}/views/pages/${path}.ejs`)) 
		response.render(`pages/${path}`, OPTIONS);
	else
		response.status(404).send("<p>Requested resource not found</p>");
});

// Pings the website every 15 minutes to keep the dyno in the `up` state
// I tried removing this once, but that made a GET request take 7 s to serve
setInterval(() => http.get("http://www.blairpath.org/"), 15 * 60 * 1000);
