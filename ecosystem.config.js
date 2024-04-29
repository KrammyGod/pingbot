try {
    require('dotenv/config');
} catch (_) {
    // Production environment does not have dotenv
}
module.exports = {
    apps : [{
        name                  : 'bot',
        script                : 'dist/index.js',
        node_args             : '--env-file .env',
        instances             : 1,
        wait_ready            : true,
        listen_timeout        : 60_000, // Listen for 1 minute before marking failed
        kill_timeout          : 10_000, // Wait 10 seconds before force killing
        shutdown_with_message : true,
        source_map_support    : true,
        appendEnvToName       : true,
        env_production: {
            NODE_ENV: 'production'
        },
        env_development: {
            NODE_ENV: 'development'
        }
    }],

    deploy : {
        production : {
            'user'        : process.env.SSH_USER,
            'host'        : process.env.SSH_HOST,
            'ref'         : 'origin/dist',
            'repo'        : 'git@github.com:KrammyGod/pingbot.git',
            'path'        : process.env.DEPLOY_PATH,
            'pre-setup'   : `mkdir -p ${process.env.DEPLOY_PATH}`,
            'pre-deploy'  : 'npm ci --omit dev',
            'post-deploy' : 'pm2 start --env production'
        },
        development : {
            'user'        : process.env.SSH_USER,
            'host'        : process.env.SSH_HOST,
            'ref'         : 'origin/dev-dist',
            'repo'        : 'git@github.com:KrammyGod/pingbot.git',
            'path'        : process.env.DEV_DEPLOY_PATH,
            'pre-setup'   : `mkdir -p ${process.env.DEV_DEPLOY_PATH}`,
            'pre-deploy'  : 'npm ci --omit dev',
            'post-deploy' : 'pm2 start --env development'
        }
    }
};
