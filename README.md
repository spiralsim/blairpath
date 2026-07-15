README last updated July 15, 2026

# Hosting
Blairpath uses Cloudflare as the registrar and for DNS services.

# Requirements
Node.js >= 18.15.0

# Installation
1. Download the Blairpath repository
```
git clone https://github.com/spiralsim/blairpath.git
```

2. Use npm to install all dependencies
```
npm i
```

# Testing
```
heroku local web
```

Then open `localhost:<port>`.

## In case of the localhost being already in use from a previous Node.js run:
```
sudo lsof -n -i :<port> | grep LISTEN
```
Copy the pid, then run
```
kill <pid>
```

# Deployment
```
git push origin master
```

(I preconfigured Blairpath's Heroku app to auto-deploy from its GitHub repo's master branch.)

# Icons
Some icons are taken from [Google Fonts Material Symbols & Icons](https://fonts.google.com/icons?selected=Material+Symbols+Outlined).
