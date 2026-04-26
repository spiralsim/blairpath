![Blairpath Wordmark](/assets/images/wordmark.svg)

# NOTE
I've only tested the development cycle on my own machine.

I previously set up a Heroku app and Google Domains domain separately.

# Requirements
Node.js >= 18.15.0

# Installation
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

# Dev Tools
In the JavaScript console, call 
```
toggleDevTools()
```

# Deployment
```
git push origin master
```

(I preconfigured Blairpath's Heroku app to auto-deploy from its GitHub repo's master branch.)
