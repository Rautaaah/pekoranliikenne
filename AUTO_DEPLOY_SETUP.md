# Auto Deploy Setup (VPS)

This repo now includes:

- `.github/workflows/deploy-vps.yml`

It deploys automatically on every push to `main` using a **self-hosted GitHub Actions runner** on your VPS.

## 1) Install GitHub self-hosted runner on VPS

In GitHub:

1. Open repo settings:  
   `https://github.com/Rautaaah/pekoranliikenne/settings/actions/runners`
2. Click **New self-hosted runner**
3. Choose **Windows**
4. Run the commands GitHub gives you on the VPS
5. Install and start as a service:
   - `.\svc install`
   - `.\svc start`

## 2) Site process lifecycle

The workflow stops only the site processes listening on ports `3000` and `5000`,
builds the frontend, and starts `start.bat site` in a detached Windows process
so the GitHub Actions job cleanup does not terminate the site. It does not stop
the GitHub Actions runner or restart the game server. Startup output is written
to `C:\Sansy\logs\site-startup.log`.

## 3) Deploy path

The workflow deploys to:

- `C:\Sansy`

If your live repo path is different, update `DEPLOY_DIR` in
`.github/workflows/deploy-vps.yml`.

## 4) Test deploy

Push any commit to `main`:

```bat
quick-push.bat "test auto deploy"
```

Then check:

- GitHub repo **Actions** tab
- job **Deploy** is green
- site listeners on ports `3000` and `5000` are healthy
- Discord signup returns the registered `sansy.shop` callback
- site shows latest changes
