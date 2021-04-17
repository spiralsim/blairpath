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
app.get(/.*/, (req, res) => {
	const path = req.path;
	if (path == '/') res.redirect("/home");
	else if (fs.existsSync(`${__dirname}/views/pages/${path}.ejs`)) res.render(`pages/${path}`);
	else res.render("pages/404");
});

// Ping every 15 minutes to keep the dyno running
setInterval(function () {
	/*
	const options = {
		host: "blairpath.org",
		port: 80,
		path: "/"
	};
	*/
	http.get("http://www.blairpath.org/home", function (res) {
		res.on("data", chunk => {
			console.log(chunk.toString());
		});
	}).on("error", err => console.log(err.message));
}, 15 * 1000);