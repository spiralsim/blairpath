This README serves as technical documentation for developers.

# Hosting
## Heroku
Blairpath is hosted as a web app on Heroku using an eco dyno.

The domain names `blairpath.org` and `www.blairpath.org` each have their own DNS Target added through Heroku:

| Domain Name | DNS Target |
| --- | --- |
| `blairpath.org` | `stormy-pomelo-m35s89a7cbphvotoyxygza4h.herokudns.com` |
| `www.blairpath.org` | `primal-puma-xapp0ceo5eyw8zsnix2on6zl.herokudns.com` |

## Cloudflare
The domain `blairpath.org` is rented through Cloudflare.

To allow users to access the domains, each has a CNAME DNS record added through Cloudflare, pointing to their corresponding Heroku DNS Target.

## Finances
Blairpath costs $77/year to operate:
1. $17/year for the domain (through Cloudflare)
2. $5/month for the application container (through Heroku)

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
The [button icons](/assets/images/buttons) were downloaded from [Google Fonts Material Symbols & Icons](https://fonts.google.com/icons).

The [wheelchair icon](/assets/images/wheelchair.svg) is the [International Symbol of Access](https://en.wikipedia.org/wiki/International_Symbol_of_Access).
