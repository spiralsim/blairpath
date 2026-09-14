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
Heroku provides this command to build and run the app locally (`4000` is a placeholder port you can change):

```
heroku local web -p 4000
```

Then open `localhost:4000` .

## In case of the localhost being already in use from a previous Node.js run:
Run this command (you may need to change `5000` to a different port number):
```
sudo lsof -n -i :5000 | grep LISTEN
```

Copy the pid (in the second column of the output), then run
```
kill -9 <pid>
```

You can now try running `heroku local web` again.

# Deployment
```
git push origin master
```

(Blairpath's Heroku app is configured to auto-deploy from its GitHub repo's master branch.)

# Icons
Some icons are taken from [Google Fonts Material Symbols & Icons](https://fonts.google.com/icons?selected=Material+Symbols+Outlined).
