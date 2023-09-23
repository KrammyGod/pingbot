require('dotenv/config');
module.exports = {
    apps : [{
        name                  : 'bot',
        script                : 'dist/index.js',
        instances             : 1,
        wait_ready            : true,
        listen_timeout        : 60_000, // Listen for 1 minute before marking failed
        kill_timeout          : 10_000, // Wait 10 seconds before force killing
        shutdown_with_message : true
    }],

    deploy : {
        production : {
            'user'        : process.env.SSH_USER,
            'host'        : process.env.SSH_HOST,
            'ref'         : 'origin/dist',
            'repo'        : 'git@github.com:KrammyGod/pingbot.git',
            'path'        : process.env.DEPLOY_PATH,
            'post-deploy' : 'npm ci --omit dev && pm2 start --env production --update-env'
        },
        development : {
            'user'        : process.env.SSH_USER,
            'host'        : process.env.SSH_HOST,
            'ref'         : 'origin/dev-dist',
            'repo'        : 'git@github.com:KrammyGod/pingbot.git',
            'path'        : process.env.DEV_DEPLOY_PATH,
            'post-deploy' : 'npm ci --omit dev && pm2 start --env development --update-env'
        }
    }
};
