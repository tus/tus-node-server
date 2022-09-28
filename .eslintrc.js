module.exports = {
    extends: '@vimeo/eslint-config-player/es6',
    env: {
        node: true,
        es6: true,
    },
    settings: {
        ecmascript: 6,
        esnext: true,
    },
    parser: 'babel-eslint',
    globals: {
        console: false,
    },
    rules: {
        'camelcase': 0,
        'comma-dangle': [1, 'always-multiline'],
        'max-nested-callbacks': ['error', 4],
        'max-params': ['error', 7],
        'complexity': ['error', 14],
        'prefer-rest-params': 0,
        'prefer-spread': 0,
        'strict': 0,
        'no-warning-comments': 0,
    },
};
