This README serves as technical documentation for developers. Map contributors don't need this.

**Last updated July 16, 2026**

# Hosting
## Heroku
Blairpath is hosted as a web app on Heroku using an eco dyno.

The domain names `blairpath.org` and `www.blairpath.org` each have their own DNS Target added through Heroku:

| Domain Name | DNS Target |
| --- | --- |
| blairpath.org | stormy-pomelo-m35s89a7cbphvotoyxygza4h.herokudns.com |
| www.blairpath.org | primal-puma-xapp0ceo5eyw8zsnix2on6zl.herokudns.com |

## Cloudflare
The domain `blairpath.org` is rented through Cloudflare.

To allow users to access the domains, each has a CNAME DNS record added through Cloudflare, pointing to their corresponding Heroku DNS Target.

# Requirements
Node.js >= 18.15.0

# Installation
1. Download the Blairpath repository
```
git clone https://github.com/spiralsim/blairpath.git
```

2. Use [npm](https://www.npmjs.com/) to install all dependencies
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

(Blairpath's Heroku app is configured to auto-deploy from its GitHub repo's master branch.)

# Icons
Some icons are taken from [Google Fonts Material Symbols & Icons](https://fonts.google.com/icons?selected=Material+Symbols+Outlined).
