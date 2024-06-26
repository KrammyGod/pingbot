module.exports = {
    apps : [{
        name                  : 'bot',
        script                : 'dist/index.js',
        node_args             : '--env-file=.env',
        exec_mode             : 'fork',
        wait_ready            : true,
        listen_timeout        : 60_000, // Listen for 1 minute before marking failed
        kill_timeout          : 10_000, // Wait 10 seconds before force killing
        shutdown_with_message : true,
        source_map_support    : true,
        appendEnvToName       : true,
        env_production: {
            BOT_ENV: 'prod',
        },
        env_development: {
            BOT_ENV: 'beta',
        },
    }],

    deploy : {
        production : {
            'user'        : process.env.SSH_USER,
            'host'        : process.env.SSH_HOST,
            'port'        : process.env.SSH_PORT,
            'ref'         : 'origin/dist',
            'repo'        : 'git@github.com:KrammyGod/pingbot.git',
            'path'        : process.env.DEPLOY_PATH,
            'pre-setup'   : `mkdir -p ${process.env.DEPLOY_PATH}`,
            'post-deploy' : 'npm ci --omit=dev && pm2 start --env production',
        },
        development : {
            'user'        : process.env.SSH_USER,
            'host'        : process.env.SSH_HOST,
            'port'        : process.env.SSH_PORT,
            'ref'         : 'origin/dev-dist',
            'repo'        : 'git@github.com:KrammyGod/pingbot.git',
            'path'        : process.env.DEV_DEPLOY_PATH,
            'pre-setup'   : `mkdir -p ${process.env.DEV_DEPLOY_PATH}`,
            'post-deploy' : 'npm i --omit=dev && pm2 start --env development',
        },
    },
};
