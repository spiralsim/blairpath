const express = require("express"), http = require("http"), fs = require("fs");

// Setup
const app = express();
const PORT = process.env.PORT || 5000;
app
	.use(express.static(`${__dirname}/assets`))
	.set("views", `${__dirname}/views`)
	.set("view engine", "ejs")
	.listen(PORT, () => console.log(`Listening on port ${PORT}`));

// Handle all asset and page requests
const DATA = JSON.parse(fs.readFileSync(`./assets/data.json`));
app.get(/.*/, (request, response) => {
	const path = request.path;
	if (path == "/") response.redirect("/map");
	else if (fs.existsSync(`${__dirname}/views/pages/${path}.ejs`)) 
		response.render(`pages/${path}`, {data: DATA});
	else response.render("pages/404");
});

// Ping the website every 15 minutes to keep the dyno up
setInterval(() => http.get("http://www.blairpath.org/"), 15 * 60 * 1000);