<template>
  <header class="navbar navbar-light fixed-top">
    <ul class="left-menu">
      <li @click="$emit('toggleDrawer')">
        <icon-menu/>
      </li>
      <li>My Logs</li>
    </ul>
    <ul class="right-menu">
      <router-link :to="{ name: 'filter-logs' }">
        <li class="filter">
          <icon-filter/>
        </li>
      </router-link>
      <li @click="$emit('syncAll')">
        <icon-cloud-upload/>
      </li>
      <li @click="openMoreMenu">
        <icon-more-vert/>
      </li>
    </ul>
    <ul id="more-menu" v-if="showMore">
      <li @click="$emit('syncAll'); showMore = false">Sync all logs</li>
      <router-link :to="{ name: 'filter-logs' }">
        <li class="filter">Filter logs</li>
      </router-link>
    </ul>
  </header>
</template>

<script>
import IconCloudUpload from '../../icons/icon-cloud-upload.vue'; // eslint-disable-line import/extensions
import IconFilter from '../../icons/icon-filter.vue'; // eslint-disable-line import/extensions
import IconMenu from '../../icons/icon-menu.vue'; // eslint-disable-line import/extensions
import IconMoreVert from '../../icons/icon-more-vert.vue'; // eslint-disable-line import/extensions

export default {
  name: 'AllLogsMenuBar',
  components: {
    IconCloudUpload,
    IconFilter,
    IconMenu,
    IconMoreVert,
  },
  data() {
    return {
      showMore: false,
    };
  },
  methods: {
    openMoreMenu() {
      this.showMore = true;
      document.addEventListener('click', this.handleClickOutside);
    },
    handleClickOutside(evt) {
      evt.stopImmediatePropagation();
      const moreMenu = document.getElementById('more-menu');
      if (moreMenu !== null && !moreMenu.contains(evt.target)) {
        this.showMore = false;
      }
    },
  },
  destroyed() {
    document.removeEventListener('click', this.handleClickOutside);
  },

};
</script>

<style scoped>
  header {
    background-color: var(--farmos-green-dark);
    color: white;
    border: none;
  }

  header svg {
    fill: white;
  }

  header ul {
    display: flex;
    flex-flow: row nowrap;
    margin: 0;
    padding: 0;
  }

  li {
    list-style: none;
    font-size: 1.25rem;
    line-height: 1.5rem;
  }

  .left-menu {
    justify-content: flex-start;
  }

  .left-menu li {
    margin-right: .5rem;
  }

  .right-menu {
    justify-content: flex-end;
  }

  .right-menu li {
    margin-left: 1rem;
  }

  .filter {
    padding: 2px;
  }

  .filter svg {
    height: 18px;
    width: 18px;
  }

  #more-menu {
    position: absolute;
    top: 3px;
    right: 3px;
    flex-flow: column;
    background-color: white;
    color: var(--gray-dark);
    box-shadow: -1px 2px 5px rgba(0, 0, 0, .25);
  }

  #more-menu li {
    padding: 1rem 1rem;
    font-size: 1rem;
  }
  #more-menu a {
    color: var(--gray-dark);
  }
</style>
