const express = require("express"), fs = require("fs");

const app = express();
const PORT = process.env.PORT || 5000;

app
	//.use("/favicon.ico", express.static(`${__dirname}/assets/favicon.ico`))
	.use(express.static(`${__dirname}/assets`))
	.set("views", `${__dirname}/views`)
	.set("view engine", "ejs")
	.listen(PORT, () => console.log(`Listening on port ${PORT}`));

app.get(/.*/, (req, res, next) => {
	const path = req.path;
	if (path == '/') res.redirect("/home");
	else if (fs.existsSync(`${__dirname}/views/pages/${path}.ejs`)) res.render(`pages/${path}`);
	else res.render("pages/404");
	next();
});
app.use((req, res) => console.log(`${req.method} ${req.path}`));