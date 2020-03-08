/*
 * @Author: xzt
 * @Date: 2019-12-16 09:49:26
 * @Last Modified by: xzt
 * @Last Modified time: 2020-03-09 01:00:31
 */
import { Service, Context } from 'egg';
import sequelize from 'sequelize';
import { ResponseWrapper, CodeNum, CodeMsg } from '../../utils/ResponseWrapper';
import * as fs from 'fs';
const Parameter = require('parameter');

export default class FolderShell extends Service {
  constructor (ctx: Context) {
    super(ctx);

    this.data = ctx.request.body;
  }

  private data; // 请求数据

  /**
   * 获取格式化后的文章列表
   * @param userUUID 用户uuid
   * @param folderId 分类文件夹id(可选)
   * @param desc 时间排序。true：倒序，false：正序(可选，默认为倒序)
   * @param count 每页显示的数量
   * @param page 页标
   */
  async getFormatFileList () {
    // 校验参数
    this.ctx.validate({
      userUUID: {
        type: 'string',
        required: true
      },
      folderId: {
        type: 'number',
        required: false
      },
      desc: {
        type: 'boolean',
        required: false
      },
      count: 'int',
      page: 'int'
    });

    let res = await this.queryFileList();

    res = { count: res.count, rows: this.formatFileList(res.rows), page: this.data.page } as any;

    return ResponseWrapper.mark(CodeNum.SUCCESS, CodeMsg.SUCCESS, res).toString();
  }

  /**
   * 获取原始的文章列表
   * @param userUUID 用户uuid
   * @param folderId 分类文件夹id(可选)
   * @param desc 时间排序。true：倒序，false：正序(可选，默认为倒序)
   * @param count 每页显示的数量
   * @param page 页标
   */
  async getFileList () {
    let res = await this.queryFileList();

    res = { ...res, page: this.data.page } as any;

    return ResponseWrapper.mark(CodeNum.SUCCESS, CodeMsg.SUCCESS, res).toString();
  }

  /**
   * 对查询到的fileList进行格式化
   * @param rows 文章列表
   * @example
   * rows: [
   *   {
   *     year: '2019',
   *     rows: [
   *       {
   *         month: '12',
   *         rows: []
   *       }
   *     ]
   *   }
   * ]
   */
  private formatFileList (rows: Array<{ createTime: string }>) {
    const map: any[] = [];
    let node;

    rows.forEach(item => {
      let date = new Date(item.createTime);

      let ry = map.some((value, index) => {
        if (value.year === date.getFullYear()) {
          node = map[index];

          return true;
        }
      });
      if (!ry) {
        map.push({ year: date.getFullYear(), rows: [ ] });
        node = map[map.length - 1];
      }

      let rm = node.rows.some((value, index) => {
        if (value.month === (date.getMonth() + 1)) {
          node = node.rows[index];

          return true;
        }
      });
      if (!rm) {
        node.rows.push({ month: date.getMonth() + 1, rows: [ ] });
        node = node.rows[node.rows.length - 1];
      }

      node.rows.push(item);
    });

    return map;
  }

  /**
   * sql获取文章列表
   */
  private async queryFileList () {
    let desc;
    if (this.data.desc !== false && !this.data.desc) {
      desc = true;
    } else {
      desc = this.data.desc;
    }
    const descin = desc ? [ 'DESC' ] : [];

    let folder: sequelize.IncludeOptions = { };
    if (this.data.folderId) {
      // 获取指定文件夹下的所有文章
      folder = {
        where: {
          folderId: this.data.folderId
        },
        attributes: {
          exclude: [ 'userId', 'folderId' ]
        }
      };
    } else {
      // 获取该用户下的所有文章
      folder = {
        attributes: [ ]
      };
    }

    let res = await this.ctx.model.File.findAndCountAll({
      raw: true,
      attributes: {
        include: [
          [ sequelize.literal('folder.folderName'), 'folderName' ],
          [ sequelize.fn('countComment', sequelize.col('fileId')) as any, 'countComment' ]
        ],
        exclude: [ 'fileId', 'userId' ]
      },
      include: [
        {
          model: this.ctx.model.User,
          where: {
            userUUID: this.data.userUUID
          },
          attributes: [ ]
        },
        {
          model: this.ctx.model.Folder,
          ...(folder as any)
        }
      ],
      order: [
        [ 'createTime', ...descin ]
      ],
      limit: this.data.count,
      offset: (this.data.page - 1) * this.data.count
    });

    return res;
  }

  /**
   * 文章搜索
   */
  async searchFiles () {
    let res;

    return ResponseWrapper.mark(CodeNum.SUCCESS, CodeMsg.SUCCESS, { });
  }

  /**
   * 获取文章内容
   * @param fileUUID {string} 文章唯一id
   */
  async getArticle () {
    // 校验参数
    this.ctx.validate({
      fileUUID: {
        type: 'string',
        required: true
      }
    });

    let res = await this.ctx.model.File.findOne({
      raw: true,
      attributes: {
        exclude: [ 'fileId', 'folderId', 'userId' ],
        include: [
          [ sequelize.literal('folder.folderName'), 'folderName' ],
          [ sequelize.literal('user.userUUID'), 'userUUID' ]
        ]
      },
      where: {
        fileUUID: this.data.fileUUID
      },
      include: [
        {
          model: this.ctx.model.Folder,
          attributes: [ ]
        },
        {
          model: this.ctx.model.User,
          attributes: [ ]
        }
      ]
    });

    if (res && res.contentURL) {
      const content = this.readFile(res.contentURL);

      delete res.contentURL;
      res.content = content;
    }

    return ResponseWrapper.mark(CodeNum.SUCCESS, CodeMsg.SUCCESS, res || { }).toString();
  }

  /**
   * 读取文件
   * @param url {string} 文件地址
   */
  private readFile (url: string) {
    try {
      return fs.readFileSync(url, 'utf-8');
    } catch (error) {
      return '';
    }
  }

  /**
   * 获取全部评论
   * @param fileUUID 文章唯一id
   * @param desc 时间排序。true：倒序，false：正序(可选，默认为true)
   * @param count 每页显示的数量
   * @param page 页标
   */
  async getComment () {
    let desc;
    if (this.data.desc !== false && !this.data.desc) {
      desc = true;
    } else {
      desc = this.data.desc;
    }
    const descin = desc ? [ 'DESC' ] : [];

    // 获取评论总数
    let resCount = await this.ctx.model.File.findOne({
      raw: true,
      attributes: {
        include: [
          [ sequelize.fn('countComment', sequelize.col('fileId')) as any, 'countComment' ]
        ],
        exclude: [ 'fileId', 'fileUUID', 'title', 'createTime', 'visit', 'contentURL', 'folderId', 'userId' ]
      },
      where: {
        fileUUID: this.data.fileUUID
      }
    });

    // 第一层评论
    let resFather = await this.ctx.model.Comment.findAndCountAll({
      raw: true,
      attributes: {
        exclude: [ 'fileId' ]
      },
      where: {
        level: 1
      },
      include: [
        {
          model: this.ctx.model.File,
          where: {
            fileUUID: this.data.fileUUID
          },
          attributes: [ ]
        },
        {
          model: this.ctx.model.User,
          attributes: [ 'nickname', 'portraitURL' ]
        }
      ],
      order: [
        [ 'createTime', ...descin ]
      ],
      limit: this.data.count,
      offset: (this.data.page - 1) * this.data.count
    });

    const ids: any[] = [ ];
    resFather.rows.forEach(item => {
      ids.push(item.commentId);
    });

    // 第二层评论
    let resChild = await this.ctx.model.Comment.findAll({
      raw: true,
      attributes: {
        exclude: [ 'fileId' ]
      },
      where: {
        level: 2,
        fatherCommentId: ids
      },
      include: [
        {
          model: this.ctx.model.File,
          where: {
            fileUUID: this.data.fileUUID
          },
          attributes: [ ]
        },
        {
          model: this.ctx.model.User,
          attributes: [ 'nickname', 'portraitURL' ]
        }
      ],
      order: [
        [ 'createTime', ...descin ]
      ]
    });

    const res = this.commentDataTrans(resFather.rows, resChild);

    return ResponseWrapper.mark(CodeNum.SUCCESS, CodeMsg.SUCCESS, { count: resCount.countComment, rows: res }).toString();
  }

  /**
   * 获取作者的评论
   * @param fileUUID 文章唯一id
   * @param desc 时间排序。true：倒序，false：正序(可选，默认为true)
   */
  async getAuthorComment () {
    let desc;
    if (this.data.desc !== false && !this.data.desc) {
      desc = true;
    } else {
      desc = this.data.desc;
    }
    const descin = desc ? [ 'DESC' ] : [];

    // 第二层评论
    let resComm = await this.ctx.model.Comment.findAll({
      raw: true,
      attributes: {
        exclude: [ 'fileId' ]
      },
      where: {
        userId: {
          [sequelize.Op.ne as any]: -1
        }
      },
      include: [
        {
          model: this.ctx.model.File,
          where: {
            fileUUID: this.data.fileUUID
          },
          attributes: [ ]
        },
        {
          model: this.ctx.model.User,
          attributes: [ 'nickname', 'portraitURL' ]
        }
      ],
      order: [
        [ 'createTime', ...descin ]
      ]
    });

    const ids: any[] = [ ];
    // 第二层评论
    const resChild = resComm.filter(item => {
      if (item.level === 2) {
        ids.push(item.fatherCommentId);

        return true;
      } else if (item.level === 1) {
        ids.push(item.commentId);
      }
    });

    // 第一层评论
    let resFather = await this.ctx.model.Comment.findAll({
      raw: true,
      attributes: {
        exclude: [ 'fileId' ]
      },
      where: {
        level: 1,
        commentId: ids
      },
      include: [
        {
          model: this.ctx.model.File,
          where: {
            fileUUID: this.data.fileUUID
          },
          attributes: [ ]
        },
        {
          model: this.ctx.model.User,
          attributes: [ 'nickname', 'portraitURL' ]
        }
      ],
      order: [
        [ 'createTime', ...descin ]
      ]
    });

    const res = this.commentDataTrans(resFather, resChild);

    return ResponseWrapper.mark(CodeNum.SUCCESS, CodeMsg.SUCCESS, { count: resFather.length + resChild.length, rows: res }).toString();
  }

  /**
   * 评论数据转换
   */
  private commentDataTrans (resFather: any[], resChild: any[]) {
    const data: any[] = [];
    resChild.map(item => {
      // 清除userId
      // userAll表示该评论为作者发表的，true表示是，false表示不是
      if (item.userId === -1) {
        item.userAll = false;
      } else {
        item.userAll = true;
        item.nickname = item['user.nickname'];
        item.portraitURL = item['user.portraitURL'];
      }

      delete item.userId;
      delete item['user.nickname'];
      delete item['user.portraitURL'];

      return item;
    });

    resFather.forEach(father => {
      const dataT: any[] = [];

      // 清除userId
      // userAll表示该评论为作者发表的，true表示是，false表示不是
      if (father.userId === -1) {
        father.userAll = false;
      } else {
        father.userAll = true;
        father.nickname = father['user.nickname'];
        father.portraitURL = father['user.portraitURL'];
      }

      delete father.userId;
      delete father['user.nickname'];
      delete father['user.portraitURL'];

      resChild.forEach(child => {
        if (father.commentId === child.fatherCommentId) {
          dataT.push(child);
        }
      });

      data.push({ ...father, child: dataT });
    });

    return data;
  }

  /**
   * 发布评论
   * @param fileUUID 文章唯一id
   * @param content 评论内容
   * @param appointCommentId 回复的指定用户
   * @param fatherCommentId 回复的第一层id
   * @param level 层级
   * @param nickname 昵称
   */
  async announceComment () {

  }

  /**
   * 登录后
   * 删除评论
   * @param commentId 评论id
   */
  async deleteComment () {

  }
}

// userId映射到userUUID，防止前端通过userId直接访问到所有用户
// 要是没登录，传递userUUID
// 要是已登录，传递token判断是否过期，获取token里的userUUID
